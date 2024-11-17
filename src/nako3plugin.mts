import { Uri } from 'vscode'
import path from 'node:path'
import fs from 'node:fs/promises'
import { ImportStatementInfo } from './nako3tokenfixer.mjs'
import { ModuleLink } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { trimOkurigana, trimQuote } from './nako3util.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import { nadesiko3 } from './nako3nadesiko3.mjs'
import { cssColor } from './csscolor.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, GlobalFunction, GlobalVarConst, GlobalVariable, DeclareThing, DeclareThings, FunctionArg } from './nako3types.mjs'

interface FileContent {
    filepath: string
    uri: Uri
    exists: boolean
    text: string
}

interface PluginMap {
    baseFilepath: string
    importName: string
    pluginFilepath: string
}

interface PluginMeta {
    pluginName: string
    description: string
    nakoRuntime: NakoRuntime[]
}

interface PluginContent {
    meta: PluginMeta
    declare: DeclareThings
}

export interface PluginInfo {
    pluginName: string
    nakoRuntime: NakoRuntime[]
    isBuiltin: boolean
    declare: DeclareThings
}

class Nako3Plugin {
    plugins: Map<string, PluginInfo>
    pluginMapping: Map<string, PluginMap>
    pluginsInNakoruntime: {[runtime:string]: string[]}

    constructor () {
        this.plugins = new Map()
        this.pluginMapping = new Map()
        this.pluginsInNakoruntime = {}
    }

    setPluginsInNakoruntime(pluginsInNakoruntime: {[runtime:string]: string[]}) {
        this.pluginsInNakoruntime = pluginsInNakoruntime

    }
    getPluginMap (baseFilepath: string, importName: string): string|null {
        const key = baseFilepath + '@' + importName
        const info = this.pluginMapping.get(key)
        return info != null ? info.pluginFilepath : null
    }

    registPluginMap (baseFilepath: string, importName: string, pluginFilepath: string) {
        const key = baseFilepath + '@' + importName
        this.pluginMapping.set(key, {
            baseFilepath,
            importName,
            pluginFilepath
        })
    }
    
    has (plugin: string): boolean {
        return this.plugins.has(plugin)
    }

    getDeclare (plugin: string): DeclareThings|undefined {
        return this.plugins.get(plugin)?.declare
    }

    getNakoRuntimes (plugin: string): NakoRuntime[]|undefined {
        return this.plugins.get(plugin)?.nakoRuntime 
    }

    getNakoRuntimeFromPlugin(imports: ImportStatementInfo[], errorInfos: ErrorInfoManager): NakoRuntime[] {
        let nakoRuntimes: NakoRuntime[] = []
        let runtimeWork: NakoRuntime[]|'invalid' = []
        for (const importInfo of imports) {
            const imp = importInfo.value
            if (/\.nako3?$/.test(imp)) {
                continue
            }
            const r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
            if (r && r.length > 1) {
                const plugin = r[1]
                if (nako3plugin.has(plugin)) {
                    const runtimes = nako3plugin.getNakoRuntimes(plugin)
                    if (runtimes && runtimes.length > 0) {
                        if (runtimeWork.length === 0) {
                            runtimeWork = runtimes
                        } else if (runtimeWork === 'invalid' || runtimeWork.join(',') === runtimes.join(',')) {
                            // nop
                        } else {
                            const r2: NakoRuntime[] = []
                            for (const r of runtimes) {
                                if (runtimeWork.includes(r)) {
                                    r2.push(r)
                                }
                            }
                            if (r2.length === 0) {
                                runtimeWork = 'invalid'
                            } else {
                                runtimeWork = r2
                            }
                        }
                    }
                }
            }
        }
        if (runtimeWork === 'invalid') {
            errorInfos.add('WARN', 'conflictNakoRuntime', {}, 0, 0, 0, 0)
            nakoRuntimes = []
        } else if (runtimeWork.length === 0) {
            nakoRuntimes = []
        } else {
            nakoRuntimes = runtimeWork
        }
        return nakoRuntimes
    }

    getCommandInfo (command: string, pluginNames: string[], nakoRuntime?: NakoRuntime): DeclareThing|null {
        const tv = trimOkurigana(command)
        const searchList = [...pluginNames]
        if (nakoRuntime && this.pluginsInNakoruntime[nakoRuntime]) {
            searchList.unshift(...this.pluginsInNakoruntime[nakoRuntime])
        }
        for (const key of searchList) {
            const commandEntry = nako3plugin.getDeclare(key)
            if (commandEntry) {
                const commandInfo = commandEntry.get(command) || commandEntry.get(tv)
                if (commandInfo) {
                    return commandInfo
                }
            }
        }
        return null
    }

    async importFromFile (pluginName: string, link?: ModuleLink, errorInfos?: ErrorInfoManager): Promise<string|null> {
        let isRemote = false
        if (pluginName.startsWith('http://') || pluginName.startsWith('https://')) {
            // absolute uri
            isRemote = true
            if (!nako3extensionOption.enableNako3FromRemote) {
                errorInfos?.add('WARN','disabledImportFromRemotePlugin', { plugin: pluginName }, 0,0,0,0)
                return null
            }
            let pluginInfo = this.plugins.get(pluginName)
            if (pluginInfo) {
                logger.info(`importFromFile: absolute url and hit cache:${pluginName}`)
                return pluginName                
            } else {
                logger.info(`importFromFile: absolute url and not hit cache:${pluginName}`)
            }
        }
        logger.debug(`importFromFile:${pluginName}`)
        const f = await this.searchPlugin(pluginName, link)
        if (f.exists) {
            const p = this.parsePlugin(f.text, f.uri, isRemote)
            if (p !== null && p.declare.size > 0) {
                logger.info(`importFromFile:plugin set ${pluginName}`)
                const info: PluginInfo = {
                    pluginName: p.meta.pluginName || pluginName,
                    isBuiltin: false,
                    nakoRuntime: p.meta.nakoRuntime,
                    declare: p.declare
                }
                this.plugins.set(f.uri.toString(), info)
                return f.uri.toString()
            }
        }
        return null
    }

    private async tryReadFile(filepath: string): Promise<FileContent> {
        const content:FileContent = {
            filepath: filepath,
            uri: Uri.file(filepath),
            text: '',
            exists: false
        }
        try {
            const text = await fs.readFile(filepath, { encoding: 'utf-8' })
            content.text = text
            content.exists = true
        } catch (err) {
            // nop
        }
        return content
    }

    async checkpluginFile(pathName:string): Promise<FileContent> {
        // 拡張子付きならそのままファイル名として存在チェック
        if (/\.(js|mjs|cjs)$/.test(pathName)) {
            const content = await this.tryReadFile(pathName)
            if (content.exists) {
                return content
            }
        }
        // ディレクトリと仮定してpackage.jsonがあるかチェック
        const jsonFile = path.join(pathName, 'package.json')
        const jsonContent = await this.tryReadFile(jsonFile)
        if (jsonContent.exists) {
            // package.jsonがありmainがあるならファイル名として読んでみる
            const jsonJson = JSON.parse(jsonContent.text)
            if (jsonJson.main) {
                const mainFile = path.join(pathName, jsonJson.main)
                const mainContent = await this.tryReadFile(mainFile)
                if (mainContent.exists) {
                    return mainContent
                }
            }
        }
        return {
            filepath: pathName, uri: Uri.file(pathName), text: '', exists: false
        }
    }

    async searchPlugin (plugin: string, link?: ModuleLink): Promise<FileContent> {
        const ngFileContent: FileContent = {
            filepath : plugin,
            uri: Uri.file(plugin),
            exists: false,
            text: ""
        }
        const nako3home = await nadesiko3.getNako3Home()
        logger.debug(`searchPlugin:home:${nako3home}`)
        // HTTPによるURL
        if (plugin.startsWith('https://') || plugin.startsWith('http://')) {
            try {
                const response = await fetch(plugin)
                if (response.status === 200) {
                    const text = await response.text()
                    logger.info(`searchPlugin:find at url`)
                    return {
                        filepath: plugin,
                        uri: Uri.parse(plugin),
                        exists: true,
                        text: text
                    }
                } else {
                    return ngFileContent
                }
            } catch (err) {
                // nop
                return ngFileContent
            }
        }
        // ローカルのフルパス指定
        if (plugin.startsWith('/') || /[A-Za-z]:\\/.test(plugin) || plugin.startsWith('file:/')) {
            logger.debug(`searchPath:check local absulute path`)
            const f = await this.checkpluginFile(plugin)
            if (f.exists) {
                logger.info(`searchPlugin:find at absolute path`)
                return f
            } else {
                return ngFileContent
            }
        }
        // 相対パス
        if (link && (plugin.startsWith('./') || plugin.startsWith('../'))) {
            logger.debug(`searchPath:check local relative path`)
            const fpath = path.join(path.resolve(path.dirname(link.uri.fsPath), plugin))
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at sourve relative path`)
                return f
            } else {
                return ngFileContent
            }
        }
        // スキーマ・絶対パス・相対パスのいずれでもない場合
        // nako3ファイルと同じ場所をチェック(./と同じ)
        if (link) {
            const fpath = path.join(path.resolve(path.dirname(link.uri.fsPath), plugin))
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at sourve relative path`)
                return f
            }
        }
        // 指定が特定の条件に合うときのみcnako3のラインタイムをチェック
        if (/^plugin_[a-z0-9_]+\.m?js/.test(plugin) && nako3home !== '') {
            // cnako3のラインタイムのsrc以下をチェック
            {
                const fpath = path.join(nako3home, 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/src`)
                    return f
                }
            }
            // cnako3のラインタイムのcore/src以下をチェック
            {
                const fpath = path.join(nako3home, 'core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/core/src`)
                    return f
                }
            }
        }
        // NAKO_LIB以下をチェック
        if (process.env.NAKO_LIB) {
            const fpath = path.join(process.env.NAKO_LIB, plugin)
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at NAKO_LIB`)
                return f
            }
        }
        if (nako3home !== '') {
            {
                const fpath = path.join(nako3home, 'node_modules', plugin)
                logger.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, '..', plugin)
                logger.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/..`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
        }
        // NAKO_LIB以下をチェック
        if (process.env.NODE_PATH) {
            const fpath = path.join(process.env.NODE_PATH, plugin)
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at NODE_PATH`)
                return f
            }
        }
        return ngFileContent
    }

    parsePlugin (text: string, uri: Uri, isRemote: boolean): PluginContent|null {
        let result:PluginContent|null = null
        try {
            result = this.parseWelformedPlugin(text, uri, isRemote)
            if (!result || result.declare.size === 0) {
                result = this.parseMinifiedPlugin(text, uri, isRemote)
             }
        } catch (err) {
            (`parsePlugin: error in parse`)
            console.log(err)
            result = null
        }
        return result
    }

    private parseMinifiedPlugin (text: string, uri: Uri, isRemote: boolean): PluginContent|null {
        const plugin: PluginContent = {
            meta:{ pluginName: '', description: '', nakoRuntime: [] },
            declare: new Map()
        }
        const meta = plugin.meta
        const commandEntry = plugin.declare
        try {
            let r: RegExpExecArray|null
            // metaタグをチェック
            r = /meta:\{type:"const",value:\{([^\}]*)\}\}/.exec(text)
            if (r && r.length > 1 && r[1] != null) {
                const metastr = r[1]
                for (const m of metastr.matchAll(/([a-zA-Z]+):("([^"]+)"|\[[^\]]\]*\])/g)) {
                    if (m && m.length > 2 && m[1] != null && m[2] != null) {
                        const key = m[1].trim()
                        const v = m[3] != null ? m[3].trim() : m[2].trim()
                        if (key === 'pluginName') {
                            meta.pluginName = v
                        } else if (key === 'description') {
                            meta.description = v
                        } else if (key === 'nakoRuntime') {
                            meta.nakoRuntime = JSON.parse(v) as NakoRuntime[]
                        }
                    }
                }
            }
            if (meta.pluginName || meta.description || meta.nakoRuntime) {
                logger.info(`parseMinifiedPlugin: meta info found`)
            }

            // 変数・定数の定義を列挙して取り込む
            for (const m of text.matchAll(/("([^"]+)"|[A-Za-z0-9]+):\{type:"(var|const)",value:([^}]*)\}/g)) {
                const name = trimOkurigana(m[2] != null ? m[2].trim() : m[1].trim())
                const type = m[3].trim() as ('var'|'const')
                const v = m[4].trim()
                if (['meta'].includes(name)) {
                    continue
                }
                let isColor = type === 'const' && cssColor.isColorName(trimQuote(v))
                const varible: GlobalVarConst = {
                    name,
                    nameNormalized: name,
                    modName: '',
                    type,
                    isExport: true,
                    isPrivate: false,
                    value: v,
                    hint: v,
                    range: null,
                    uri,
                    origin: 'plugin',
                    isRemote,
                    isColor,
                    activeDeclare: true
                }
                commandEntry.set(name, varible)
            }
            if (commandEntry.size > 0) {
                logger.info(`parseMinifiedPlugin: variable / constant found`)
            }

            // 関数の定義を列挙して取り込む
            for (const m of text.matchAll(/("([^"]+)"|[A-Za-z0-9]+):\{(type:"func",[^\{]*)\{/g)) {
                let name = trimOkurigana(m[2] != null ? m[2].trim() : m[1].trim())
                let memo = m[3].trim()
                let info:any = {
                    name,
                    type: '',
                    pure: true,
                    asyncFn: false,
                    desc: '',
                    josi: null,
                    yomi: '',
                    args: []
                }
                if (['初期化', '!クリア'].includes(info.name)) {
                    continue
                }
                // 定義-type
                r = /type:"([^"]+)",/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.type = r[1].trim()
                }
                // 定義-pure
                r = /pure:([^,]*),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.pure = r[1].trim() === "!0" || r[1].trim() === "true"
                }
                // 定義-josi
                r = /josi:(\[(\[("[^"]*",?)*\],?)*\]),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    try {
                        info.josi = JSON.parse(r[1].trim().replaceAll("'", '"'))
                    } catch (err) {
                        logger.info(`parsePlugin: cause error in parse josi`)
                        console.log(err)
                    }
                }
                // 定義-asyncFn
                r = /asyncFn:([^,]*),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.asyncFn = r[1].trim() === "!0" || r[1].trim() === "true"
                }
                // 定義-fn
                r = /fn:(async function|function)(\(.*\).*)/.exec(memo)
                if (r && r.length > 2 && r[2] != null) {
                    let args: FunctionArg[] = []
                    for (let j = 0; j < info.josi.length; j++) {
                        args.push({
                            varname: String.fromCharCode(65 + j),
                            josi: info.josi[j],
                            attr: [],
                            range: null
                        })
                    }
                    info.args = args
                    const func: GlobalFunction = {
                        name: info.name,
                        nameNormalized: info.name,
                        modName: '',
                        type: 'func',
                        isPure: info.pure,
                        isMumei: false,
                        isAsync: info.asyncFn,
                        isExport: true,
                        isPrivate: false,
                        isVariableJosi: false,
                        hint: info.desc + info.asyncFn ? '(非同期関数)' : '',
                        args,
                        range: null,
                        scopeId: null,
                        uri,
                        origin: 'plugin',
                        isRemote,
                        activeDeclare: true
                    }
                    commandEntry.set(info.name, func)
                } else {
                    console.log(`parseMinifiedPlugin: not match fn`)
                    console.log(r)
                    console.log(memo)
                }
            }
        } catch (err) {
            console.log(err)
            return null
        }
        return plugin
    }

    private parseWelformedPlugin (text: string, uri: Uri, isRemote: boolean): PluginContent|null {
        const plugin: PluginContent = {
            meta:{ pluginName: '', description: '', nakoRuntime: [] },
            declare: new Map()
        }
        const meta = plugin.meta
        const commandEntry = plugin.declare
        const lines = text.split(/[\r\n]/)
        if (!lines) {
            return null
        }
        try {
            let currentTitle = ''
            let inMeta = false
            let info:any = {}
            let r: RegExpExecArray|null
            for (let i = 0;i < lines.length; i++) {
                let line = lines[i]
                if (line.length === 0) {
                    continue
                }
                if (inMeta) {
                    r = /^\s*pluginName:\s*'(.*)'/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        meta.pluginName = r[1].trim()
                        continue
                    }
                    r = /^\s*description:\s*'(.*)'/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        meta.description = r[1].trim()
                        continue
                    }
                    r = /^\s*nakoRuntime:\s*(\[.*\])/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        try {
                            meta.nakoRuntime = JSON.parse(r[1].trim()) as NakoRuntime[]
                        } catch (err) {
                            logger.debug(`parseWenformedPlugin: cause error on parse nakoRuntime`)
                            console.log(err)
                        }
                        continue
                    }
                    if (/^\s*\},$/.test(line)) {
                        inMeta = false
                        if (meta.pluginName || meta.description || meta.nakoRuntime) {
                            logger.info(`parseWenformedPlugin: meta info found`)
                        } else {
                            logger.info(`parseWenformedPlugin: meta info empty`)
                        }
                    }
                    continue
                }
                if (/^\s*'meta':\s*\{/.test(line)) {
                    inMeta = true
                    logger.info(`parseWenformedPlugin: meta tag found`)
                    continue
                }
                // 見出し行
                r = /^\s*\/\/\s*@(.*)$/.exec(line)
                if (r && r.length > 1 && r[1] != null && !r[1].startsWith('ts-')) {
                    currentTitle = r[1].trim()
                    continue
                }
                // 変数・定数行
                r = /^(\s*)'([^']+)'\s*:\s*\{\s*type\s*:\s*'(const|var)'\s*,\s*value\s*:\s*([^\}]*)\}\s*,\s*(\/\/ @(.*))?$/.exec(line)
                if (r && r.length > 4 && r[1] != null && r[2] != null && r[3] != null && r[4] != null) {
                    const col = r[1].length + 1
                    const resLen = r[2].length
                    const name = trimOkurigana(r[2].trim())
                    const type = r[3].trim() as 'var'|'const'
                    const v = r[4].trim()
                    let isColor = type === 'const' && cssColor.isColorName(trimQuote(v))
                    const yomi = r[6] != null ? r[6].trim() : ''
                    const varible: GlobalVarConst = {
                        name,
                        nameNormalized: name,
                        modName: '',
                        type,
                        isExport: true,
                        isPrivate: false,
                        value: v,
                        hint: v,
                        range: { startLine: i, startCol: col, endLine: i, endCol: col + resLen, resEndCol: col + resLen },
                        uri,
                        origin: 'plugin',
                        isRemote,
                        isColor,
                        activeDeclare: true
                    }
                    commandEntry.set(name, varible)
                    continue
                }
                // 関数定義開始行
                r = /^(\s*)'([^']+)'\s*:\s*(\{|\[)\s*(\/\/\s*@(.+))?$/.exec(line)
                if (r && r.length > 1 && r[1] != null && r[2] != null) {
                    const col = r[1].length + 1
                    const resLen = r[2].length
                    const name = trimOkurigana(r[2].trim())
                    let yomi = ''
                    let desc = ''
                    if (r.length > 4 && r[4] != null) {
                        let memo = r[4].trim().split('// @', 2)
                        if (memo.length >= 2) {
                            desc = memo[0].trim()
                            yomi = memo[1].trim()
                        } else {
                            desc = r[4].trim()
                        }
                    }
                    info = {
                        name,
                        desc,
                        yomi,
                        type: '',
                        josi: null,
                        pure: true,
                        asyncFn: false,
                        args: [],
                        range: { startLine: i, startCol: col, endLine: i, endCol: col + resLen, resEndCol: col + resLen },
                    }
                    continue
                }
                // 定義-type行
                r = /^\s*'?type'?\s*:\s*'([^']+)'\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.type = r[1].trim()
                    continue
                }
                // 定義-josi行
                r = /^\s*'?josi'?\s*:\s*(.+),$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    try {
                        info.josi = JSON.parse(r[1].trim().replaceAll("'", '"'))
                    } catch (err) {
                        logger.info(`parsePlugin: cause error in parse josi`)
                        console.log(err)
                    }
                    continue
                }
                // 定義-pure行
                r = /^\s*'?pure'?\s*:\s*(true|false)\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.pure = r[1].trim() === 'true'
                    continue
                }
                // 定義-asyncFn行
                r = /^\s*'?asyncFn'?\s*:\s*(true|false)\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.asyncFn = r[1].trim() === 'true'
                    continue
                }
                // 定義-fn行
                r = /^\s*'?fn'?\s*:\s*(async function|function)\s*(\(.*\).*)$/.exec(line)
                if (r && r.length > 2 && r[2] != null) {
                    let args: FunctionArg[] = []
                    let argparam = r[2].trim()
                    if (argparam.indexOf('//') > -1) {
                        argparam = argparam.split('//')[0]
                    }
                    r = /^[^\(]*\((.*)\)[^\)]*$/.exec(argparam)
                    if (r && r.length > 1 && r[1] != null) {
                        argparam = r[1].trim()
                        r = /^(\s*sys|(.*),\s*sys)\s*$/.exec(argparam)
                        if (r && r.length > 2 && r[2] != null) {
                            argparam = r[2].trim()
                        }
                        let params = argparam.split(',')
                        for (let j = 0; j < params.length; j++) {
                            let param = params[j].trim().toUpperCase()
                            args.push({
                                varname: param,
                                josi: info.josi[j],
                                attr: [],
                                range: null
                            })
                        }
                        info.args = args
                        if (['初期化', '!クリア'].includes(info.name)) {
                            continue
                        }
                        const func: GlobalFunction = {
                            name: info.name,
                            nameNormalized: info.name,
                            modName: '',
                            type: 'func',
                            isPure: info.pure,
                            isMumei: false,
                            isAsync: info.asyncFn,
                            isExport: true,
                            isPrivate: false,
                            isVariableJosi: false,
                            hint: info.desc + info.asyncFn ? '(非同期関数)' : '',
                            args,
                            range: info.range,
                            scopeId: null,
                            uri,
                            origin: 'plugin',
                            isRemote,
                            activeDeclare: true
                        }
                        commandEntry.set(info.name, func)
                    } else {
                        logger.info(`parseplugin: no () in fn line:${line}`)
                    }
                    continue
                }
            }
        } catch (err) {
            console.log(err)
            return null
        }
        return plugin
    }
}

export const nako3plugin = new Nako3Plugin()
