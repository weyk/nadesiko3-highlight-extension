import { Uri } from 'vscode'
import path from 'node:path'
import fs from 'node:fs/promises'

import { Nako3PluginParser } from './nako3plugin_parser.mjs'
import { LinkPlugins } from './nako3module.mjs'
import { ErrorInfoSubset } from './nako3errorinfo.mjs'
import { mergeNakoRuntimes, trimOkurigana } from './nako3util.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import { nadesiko3 } from './nako3nadesiko3.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, GlobalFunction, GlobalVarConst, DeclareThing, DeclareThings, FunctionArg } from './nako3/nako3types.mjs'
import type { Token } from './nako3/nako3token.mjs'

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
    pluginParser: Nako3PluginParser
    plugins: Map<string, PluginInfo>
    pluginMapping: Map<string, PluginMap>
    pluginsInNakoruntime: {[runtime:string]: string[]}
    protected log = logger.fromKey('/Nako3Plugin')

    constructor () {
        this.pluginParser = new Nako3PluginParser()
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
            const p = this.pluginParser.parsePlugin(f.text, { uri: f.uri, isRemote })
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

}

export const nako3plugin = new Nako3Plugin()
