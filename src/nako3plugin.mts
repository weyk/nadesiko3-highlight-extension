import { Uri } from 'vscode'
import path from 'node:path'
import fs from 'node:fs/promises'
import { ImportStatementInfo } from './nako3tokenfixer.mjs'
import { ModuleLink, LinkPlugin, LinkPlugins } from './nako3module.mjs'
import { ErrorInfoManager, ErrorInfoSubset } from './nako3errorinfo.mjs'
import { Nako3Range } from './nako3range.mjs'
import { mergeNakoRuntimes, trimOkurigana, trimQuote } from './nako3util.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import { nadesiko3 } from './nako3nadesiko3.mjs'
import { cssColor } from './csscolor.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, GlobalFunction, GlobalVarConst, DeclareThing, DeclareThings, FunctionArg } from './nako3types.mjs'
import type { Token } from './nako3token.mjs'

type LocationType = '?'|'remote'|'workspace'|'editor'|'fs'|'builtin'

type ContentKey = number|string

interface FileContent {
    filepath: string
    uri: Uri
    location: LocationType
    contentKey: ContentKey
    exists: boolean
    changed: boolean
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
    declare: DeclareThings
    location: LocationType
    contentKey: ContentKey
    uri: Uri|null
}

interface ImportResult {
    importKey: string
    pluginKey: string
    existFile: boolean
    hasCommandInfo: boolean
    filepath: string
    contentKey: string|number|null
    errorInfos: ErrorInfoSubset[]
}

export interface PluginImportResult {
    pluginName: string
    changed: boolean
    errorInfos?: ErrorInfoSubset[]
    plugin?: PluginInfo
}

const suggestWords: Map<string, NakoRuntime[]> = new Map([
    ['デスクトップ', ['cnako']],
    ['マイドキュメント', ['cnako']],
    ['母艦', ['cnako']],
    ['コマンドライン', ['cnako']],
    ['母艦パス', ['cnako']],
    ['読', ['cnako']],
    ['バイナリ読', ['cnako']],
    ['SJISファイル読', ['cnako']],
    ['起動待機', ['cnako']],
    ['起動', ['cnako']],
    ['起動時', ['cnako']],
    ['ファイル列挙', ['cnako']],
    ['全ファイル列挙', ['cnako']],
    ['フォルダ存在', ['cnako']],
    ['ファイルコピー', ['cnako']],
    ['ファイルコピー時', ['cnako']],
    ['ファイル移動', ['cnako']],
    ['ファイル移動時', ['cnako']],
    ['フォルダ作成', ['cnako']],
    ['ファイル名抽出', ['cnako']],
    ['パス抽出', ['cnako']],
    ['描画開始', ['wnako']],
    ['DOM要素作成', ['wnako']],
    ['DOM要素取得', ['wnako']],
    ['DOM要素全取得', ['wnako']],
    ['マウスクリック時', ['wnako']],
    ['フォーム作成', ['wnako']],
    ['ラベル作成', ['wnako']],
    ['ボタン作成', ['wnako']]
])

class Nako3Plugin {
    plugins: Map<string, PluginInfo>
    pluginMapping: Map<string, PluginMap>
    pluginsInNakoruntime: {[runtime:string]: string[]}
    protected log = logger.fromKey('/Nako3Plugin')

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

    getNakoRuntimesFromWord (cmd: string): NakoRuntime[]|undefined {
        return suggestWords.get(cmd)
    }

    getNakoRuntimeFromPlugin(imports: LinkPlugins): NakoRuntime[]|'invalid' {
        let runtimeWork: NakoRuntime[]|'invalid' = []
        for (const [, importInfo] of imports) {
            const plugin = importInfo.pluginKey
            if (nako3plugin.has(plugin)) {
                const runtimes = nako3plugin.getNakoRuntimes(plugin)
                runtimeWork = mergeNakoRuntimes(runtimeWork, runtimes)
            }
        }
        return runtimeWork
    }

    getNakoRuntimeFromToken(tokens: Token[]): NakoRuntime[]|'invalid' {
        let runtimeWork: NakoRuntime[]|'invalid' = []
        for (const token of tokens) {
            if (['word', 'sys_func'].includes(token.fixType)) {
                const tv = trimOkurigana(token.value)
                const runtimes = this.getNakoRuntimesFromWord(tv)
                runtimeWork = mergeNakoRuntimes(runtimeWork, runtimes)
            }
        }
        return runtimeWork
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

    async import (imp: string, baseFilepath: string): Promise<ImportResult> {
        const log = this.log.appendKey('.import')
        let r: RegExpExecArray|null
        const result : ImportResult = {
            importKey: imp,
            pluginKey: imp,
            existFile: false,
            hasCommandInfo: false,
            filepath: '',
            contentKey: null,
            errorInfos: []
        }
        r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
        if (r && r.length > 1 && r[1] != null) {
            const pluginName = r[1]
            log.info(`imports:check js plugin with plugin name:${pluginName}`)
            // Nako3Pluginに既にあるかどうかを名前でチェック。
            // 既にあるならそれをそのまま使う。
            if (nako3plugin.has(pluginName)) {
                result.pluginKey = pluginName
                result.hasCommandInfo = true
                log.info(`imports: already resist plugin("${pluginName}")`)
            }
        }
        r = /[\\\/]?(([^\\\/]*)(\.(js|mjs|cjs))?)$/.exec(imp)
        if (r && r.length > 1 && r[1] != null) {
            const pluginFilename = r[1]
            log.info(`imports:add js plugin without plugin name:${pluginFilename}`)
            let impresult = await nako3plugin.importFromFile(imp, baseFilepath)
            if (impresult !== null) {
                if (impresult.errorInfos && impresult.errorInfos.length > 0) {
                    result.errorInfos.push(...impresult.errorInfos)
                } else {
                    if (impresult.changed && impresult.plugin) {
                        const pinfo = impresult.plugin
                        result.existFile = true
                        result.filepath = impresult.pluginName
                        result.contentKey = pinfo.contentKey
                        nako3plugin.plugins.set(result.filepath,  pinfo!)
                        if (nako3plugin.has(result.filepath)) {
                            if (!result.hasCommandInfo) {
                                result.pluginKey = result.filepath
                            }
                            result.hasCommandInfo = true
                        } else {
                            const importError: ErrorInfoSubset = {
                                level: 'WARN',
                                messageId: 'noPluginInfo',
                                args: {
                                 plugin: pluginFilename
                                }
                            }
                            result.errorInfos.push(importError)
                        }
                    } else {
                        log.info(`ImportPlugins: no changed plugin "${pluginFilename}"`)
                        result.existFile = true
                        result.filepath = impresult.pluginName
                        result.hasCommandInfo = true
                        const pluginInfo = nako3plugin.plugins.get(result.filepath)
                        result.contentKey = pluginInfo?.contentKey || null
                    }
                }
            } else {
                // this.errorInfos.add('WARN', 'noSupport3rdPlugin', { plugin }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                log.info(`ImportPlugins: error import 3rd plugin "${pluginFilename}"`)
                if (result.hasCommandInfo) {
                    const importError: ErrorInfoSubset = {
                        level: 'WARN',
                        messageId: 'warnImport3rdPlugin',
                        args: {
                            plugin: pluginFilename
                        }
                    }
                    result.errorInfos.push(importError)
                } else {
                    const importError: ErrorInfoSubset = {
                        level: 'ERROR',
                        messageId: 'errorImport3rdPlugin',
                        args: {
                            plugin: pluginFilename
                        }
                    }
                    result.errorInfos.push(importError)
                }
                result.filepath = pluginFilename
            }
        } else {
            const importError: ErrorInfoSubset = {
                level: 'WARN',
                messageId: 'unknownImport',
                args: {
                    file: imp
                }
            }
            result.errorInfos.push(importError)
        }
        return result
    }

    async importFromFile (pluginName: string, baseFilepath?: string): Promise<PluginImportResult|null> {
        const log = this.log.appendKey('.importFromFile')
        let isRemote = false
        if (pluginName.startsWith('http://') || pluginName.startsWith('https://')) {
            // absolute uri
            isRemote = true
            if (!nako3extensionOption.enableNako3FromRemote) {
                const importError: ErrorInfoSubset = {
                    level: 'WARN',
                    messageId: 'disabledImportFromRemotePlugin',
                    args: {
                      plugin: pluginName
                    }
                }
                const result: PluginImportResult = {
                    pluginName,
                    changed: false,
                    errorInfos: [importError]
                }
                return result               
            }
            let pluginInfo = this.plugins.get(pluginName)
            if (pluginInfo) {
                log.info(`importFromFile: absolute url and hit cache:${pluginName}`)
                const result: PluginImportResult = {
                    pluginName,
                    changed: false,
                    plugin: pluginInfo
                }
                return result               
            } else {
                log.info(`importFromFile: absolute url and not hit cache:${pluginName}`)
            }
        }
        log.debug(`importFromFile:${pluginName}`)
        const f = await this.searchPlugin(pluginName, baseFilepath)
        if (f && f.exists) {
            log.info(`importFromFile: exist file "${pluginName}"`)
            if (!f.changed) {
                log.info(`importFromFile: no changed "${pluginName}"`)
                const result: PluginImportResult = {
                    pluginName: f.filepath,
                    changed: false,
                }
                return result
            }
            log.info(`importFromFile: parse start "${pluginName}"`)
            const p = this.parsePlugin(f.text, f.uri, isRemote)
            if (p !== null && p.declare.size > 0) {
                log.info(`importFromFile:plugin set ${pluginName}`)
                const info: PluginInfo = {
                    pluginName: p.meta.pluginName || pluginName,
                    location: f.location,
                    contentKey: f.contentKey,
                    uri: f.uri,
                    nakoRuntime: p.meta.nakoRuntime,
                    declare: p.declare
                }
                const result: PluginImportResult = {
                    pluginName: info.pluginName,
                    changed: true,
                    plugin: info
                }
                return result
            } else {
                log.info(`importFromFile: parse failed in ${pluginName}`)
            }
        } else {
            log.info(`importFromFile: not found ${pluginName}`)
        }
        return null
    }

    private async tryReadFile(filepath: string, plugin?: PluginInfo): Promise<FileContent|null> {
        const content:FileContent = {
            filepath: filepath,
            location: 'fs',
            contentKey: '',
            uri: Uri.file(filepath),
            text: '',
            changed: true,
            exists: false
        }
        try {
            let f = await fs.lstat(filepath)
            if (!f.isFile) {
                return null
            }
            content.contentKey = f.mtimeMs
            content.exists = true
            if (plugin) {
                if (typeof plugin.contentKey === 'number') {
                    if (f.mtimeMs === plugin.contentKey) {
                        content.changed = false
                        return content
                    }  
                }
            }
            const text = await fs.readFile(filepath, { encoding: 'utf-8' })
            content.text = text
        } catch (err) {
            // nop
            return null
        }
        return content
    }

    private async tryReadPluginFile(filepath: string): Promise<FileContent|null> {
        const plugin = this.plugins.get(filepath)
        return await this.tryReadFile(filepath, plugin)
    }

    private async tryReadPluginFileFromRemote(pluginUrl: string): Promise<FileContent|null> {
        const log = this.log.appendKey('.tryReadPluginFileFromRemote')
        const plugin = this.plugins.get(pluginUrl)
        try {
            const headers = new Headers()
            if (plugin && typeof plugin.contentKey === 'string' && plugin.contentKey.length > 2) {
                const type = plugin.contentKey.substring(0,1)
                const v = plugin.contentKey.slice(2)
                if (type === 'E') {
                    headers.set('If-None-Match', v)
                } else if (type === 'L') {
                    headers.set('If-Modified-Since', v)
                }
            }
            const reqOpts = {
                headers
            }
            const request = new Request(pluginUrl, reqOpts)

            const response = await fetch(request)

            if (response.status === 304) {
                log.info(`searchPlugin:find at url`)
                return {
                    filepath: pluginUrl,
                    uri: Uri.parse(pluginUrl),
                    location: 'remote',
                    contentKey: plugin!.contentKey,
                    changed: true,
                    exists: true,
                    text: ''
                }
            } else if (response.status === 200) {
                const text = await response.text()
                let contentKey = ''
                if (response.headers.has('ETag')) {
                    contentKey = `E:${response.headers.has('ETag')}`
                } else if (response.headers.has('Last-Modified')) {
                    contentKey = `L:${response.headers.has('Last-Modified')}`
                }
                log.info(`searchPlugin:find at url`)
                return {
                    filepath: pluginUrl,
                    uri: Uri.parse(pluginUrl),
                    location: 'remote',
                    contentKey,
                    changed: true,
                    exists: true,
                    text: text
                }
            } else {
                log.info(`searchPlugin: bad status "${response.status}" in fetch "${pluginUrl}"`)
                return null
            }
        } catch (err) {
            // nop
            log.info(`searchPlugin: exception in fetch "${pluginUrl}"`)
            return null
        }
    }

    private async checkPluginFile(pathName: string): Promise<FileContent|null> {
        // 拡張子付きならそのままファイル名として存在チェック
        if (/\.(js|mjs|cjs)$/.test(pathName)) {
            const content = await this.tryReadPluginFile(pathName)
            if (content) {
                return content
            }
        }
        // ディレクトリと仮定してpackage.jsonがあるかチェック
        const jsonFile = path.join(pathName, 'package.json')
        const jsonContent = await this.tryReadFile(jsonFile)
        if (jsonContent) {
            // package.jsonがありmainがあるならファイル名として読んでみる
            const jsonJson = JSON.parse(jsonContent.text)
            if (jsonJson.main) {
                const mainFile = path.join(pathName, jsonJson.main)
                const mainContent = await this.tryReadPluginFile(mainFile)
                if (mainContent) {
                    return mainContent
                }
            }
        }
        return null
    }

    private async searchPlugin (plugin: string, baseFilepath?: string): Promise<FileContent|null> {
        const log = this.log.appendKey('.searchPlugin')
        const nako3home = await nadesiko3.getNako3Home()
        log.debug(`searchPlugin:home:${nako3home}`)
        // HTTPによるURL
        if (plugin.startsWith('https://') || plugin.startsWith('http://')) {
            return await this.tryReadPluginFileFromRemote(plugin)
        }
        // ローカルのフルパス指定
        if (plugin.startsWith('/') || /[A-Za-z]:\\/.test(plugin) || plugin.startsWith('file:/')) {
            log.debug(`searchPath:check local absulute path`)
            const f = await this.checkPluginFile(plugin)
            if (f) {
                log.info(`searchPlugin:find at absolute path`)
                return f
            } else {
                return null
            }
        }
        // 相対パス
        if (baseFilepath && (plugin.startsWith('./') || plugin.startsWith('../'))) {
            log.debug(`searchPath:check local relative path`)
            const fpath = path.join(path.resolve(path.dirname(baseFilepath), plugin))
            const f = await this.checkPluginFile(fpath)
            if (f) {
                log.info(`searchPlugin:find at sourve relative path`)
                return f
            } else {
                return null
            }
        }
        // スキーマ・絶対パス・相対パスのいずれでもない場合
        // nako3ファイルと同じ場所をチェック(./と同じ)
        if (baseFilepath) {
            const fpath = path.join(path.resolve(path.dirname(baseFilepath), plugin))
            const f = await this.checkPluginFile(fpath)
            if (f) {
                log.info(`searchPlugin:find at sourve relative path`)
                return f
            }
        }
        // パスが特定の条件に合うときのみcnako3のラインタイムをチェック
        if (/^plugin_[a-z0-9_]+\.m?js/.test(plugin) && nako3home !== '') {
            // cnako3のラインタイムのsrc以下をチェック
            {
                const fpath = path.join(nako3home, 'src', plugin)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/src`)
                    return f
                }
            }
            // cnako3のラインタイムのcore/src以下をチェック
            {
                const fpath = path.join(nako3home, 'core', 'src', plugin)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/core/src`)
                    return f
                }
            }
        }
        // NAKO_LIB環境変数の下をチェック
        if (process.env.NAKO_LIB) {
            const fpath = path.join(process.env.NAKO_LIB, plugin)
            const f = await this.checkPluginFile(fpath)
            if (f) {
                log.info(`searchPlugin:find at NAKO_LIB`)
                return f
            }
        }
        // なでしこ3のhomeがあるならその下をチェック
        if (nako3home !== '') {
            {
                const fpath = path.join(nako3home, 'node_modules', plugin)
                log.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/node_modules`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, '..', plugin)
                log.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/..`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, plugin)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkPluginFile(fpath)
                if (f) {
                    log.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
        }
        // NODE_PATH環境変数の下をチェック
        if (process.env.NODE_PATH) {
            const fpath = path.join(process.env.NODE_PATH, plugin)
            const f = await this.checkPluginFile(fpath)
            if (f) {
                log.info(`searchPlugin:find at NODE_PATH`)
                return f
            }
        }
        return null
    }

    private parsePlugin (text: string, uri: Uri, isRemote: boolean): PluginContent|null {
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
        const log = this.log.appendKey('.parseMinifiedPlugin')
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
                log.info(`parseMinifiedPlugin: meta info found`)
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
                log.info(`parseMinifiedPlugin: variable / constant found`)
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
                        log.error(`parsePlugin: cause error in parse josi`)
                        log.error(err)
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
                    log.debug(`parseMinifiedPlugin: not match fn`)
                    log.debug(r)
                    log.debug(memo)
                }
            }
        } catch (err) {
            log.error(err)
            return null
        }
        return plugin
    }

    private parseWelformedPlugin (text: string, uri: Uri, isRemote: boolean): PluginContent|null {
        const log = this.log.appendKey('.parseWelformedPlugin')
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
                            meta.nakoRuntime = JSON.parse(r[1].trim().replaceAll("'",'"')) as NakoRuntime[]
                        } catch (err) {
                            log.debug(`parseWenformedPlugin: cause error on parse nakoRuntime`)
                            console.log(err)
                        }
                        continue
                    }
                    if (/^\s*\},$/.test(line)) {
                        inMeta = false
                        if (meta.pluginName || meta.description || meta.nakoRuntime) {
                            log.info(`parseWenformedPlugin: meta info found`)
                        } else {
                            log.info(`parseWenformedPlugin: meta info empty`)
                        }
                    }
                    continue
                }
                if (/^\s*'meta':\s*\{/.test(line)) {
                    inMeta = true
                    log.info(`parseWenformedPlugin: meta tag found`)
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
                        range: new Nako3Range(i, col, i, col + resLen, col + resLen),
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
                        range: new Nako3Range(i, col, i, col + resLen, col + resLen)
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
                        log.error(`parsePlugin: cause error in parse josi`)
                        log.error(err)
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
                        log.info(`parseplugin: no () in fn line:${line}`)
                    }
                    continue
                }
            }
        } catch (err) {
            log.error(err)
            return null
        }
        return plugin
    }
}

export const nako3plugin = new Nako3Plugin()
