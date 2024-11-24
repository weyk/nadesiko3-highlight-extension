import {
    CancellationToken,
    Disposable,
    FileSystemWatcher,
    TextDocument,
    Uri,
    workspace
} from 'vscode'
import { EventEmitter } from 'node:events'
import { Nako3DocumentExt } from './nako3documentext.mjs'
import { Nako3Range } from './nako3range.mjs'
import { ImportInfo, ImportPlugin } from './nako3module.mjs'
import { ImportStatementInfo } from './nako3tokenfixer.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { nako3diagnostic } from './provider/nako3diagnotic.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, ExternalInfo } from './nako3types.mjs'
import type { Token } from './nako3token.mjs'
import { filenameToModName } from './nako3util.mjs'

interface DependNako3Info {
    uri: Uri
    importKey?: string
    range?: Nako3Range
}

export class Nako3Documents extends EventEmitter implements Disposable {
    docs: Map<string, Nako3DocumentExt>
    fileWacther: FileSystemWatcher
    private isAnyTextUpdated: boolean 

    constructor () {
        super()
        this.docs = new Map()
        this.isAnyTextUpdated = false
        this.fileWacther = workspace.createFileSystemWatcher('{**/*.nako3,**/*.js,**/*.cjs,**/*.mjs}', true)
        this.fileWacther.onDidChange(async uri => {
            await this.fileOnDidChange(uri)
        })
        this.fileWacther.onDidDelete(uri => {
            this.fileOnDidDelete(uri)
        })
    }

    dispose(): void {
        if (this.fileWacther) {
            this.fileWacther.dispose()
        }
    }
   
    async fileOnDidChange (uri: Uri) {
        if (/\.nako3$/.test(uri.fsPath)) {
            const doc = this.get(uri)
            if (doc) {
                if (!doc.isTextDocument) {
                    await doc.updateText(uri)
                    await this.analyze(doc)
                }
            }
        } if (/\.(js|cjs|mjs)$/.test(uri.fsPath)) {
            const uristr = uri.toString()
            if (nako3plugin.has(uristr)) {
                nako3plugin.importFromFile(uristr)
            }
        }
    }
 
    fileOnDidDelete (uri: Uri) {
        const uristr = uri.toString()
        if (/\.nako3$/.test(uri.fsPath)) {
            const doc = this.get(uri)
            if (doc) {
                this.docs.delete(uristr)
                doc.link.importPlugins.clear()
                doc.link.importNako3s.clear()
                for (const [ ,target ] of this.docs) {
                    target.nako3doc.moduleEnv.externalThings.delete(uristr)
                    target.link.importBy.delete(uristr)
                }
                nako3diagnostic.markRefreshDiagnostics()
            }
        } if (/\.(js|cjs|mjs)$/.test(uri.fsPath)) {
            if (nako3plugin.has(uristr)) {
                nako3plugin.plugins.delete(uristr)
            }
        }
    }
 
    /**
     * TextDocumentを元にして登録する
     * 既にUriから登録してある場合はTextDocument管理に切り替わる。
     * @param document 登録をするvscode.TextDocumentを指定する
     * @returns １対１対応するNako3DocumentExtを返す
     */
    public openFromDocument (document: TextDocument): Nako3DocumentExt {
        const fileName = this.getFileName(document)
        let doc = this.get(document)
        if (!doc) {
            const uri = this.getUri(document)
            doc = this.newDocument(fileName, uri, document)
            console.log(`document open: open by TextDocument(${fileName})`)
        } else {
            if (!doc.isTextDocument) {
                doc.isTextDocument = true
                console.log(`document open: already opened, change to TextDocument(${fileName})`)
            } else {
                console.log(`document open: already opened by TextDocument(${fileName})`)
            }
        }
        return doc
    }

    /**
     * Uriを元にして登録する
     * 既に登録してある場合は何も変化しない。
     * @param uri 登録をするvscode.Uriを指定する
     * @returns １対１対応するNako3DocumentExtを返す
     */
    public openFromFile (uri: Uri): Nako3DocumentExt {
        const fileName = this.getFileName(uri)
        let doc: Nako3DocumentExt|undefined = this.get(uri)
        if (!doc) {
            doc = this.newDocument(fileName, uri)
            console.log(`document open: open by file(${fileName})`)
        } else {
            if (doc.isTextDocument) {
                console.log(`document open: already file opened by TextDocument(${fileName})`)
            } else {
                console.log(`document open: already file opened by file(${fileName})`)
            }
        }
        return doc
    }

    /**
     * 登録を際にTextDocument/Uri共通で必要な処理をまとめたもの。
     * @param fileName Uri.toString()をしたもの。内部での管理キー。
     * @param uri 登録をするファイルのUri
     * @param document 登録をするファイルのTextDocument(Uriベースの場合は不要)
     * @returns 登録したNako3DocumentExtを返す
     */
    private newDocument (fileName: string, uri: Uri, document?: TextDocument): Nako3DocumentExt {
        const doc = new Nako3DocumentExt(document || uri)
        this.docs.set(fileName, doc)
        doc.nako3doc.onTextUpdated = () => {
            this.isAnyTextUpdated = true
        }
        return doc
    }

    private fireChangeNakoRuntime (doc: Nako3DocumentExt, nakoRuntime:NakoRuntime) {
        logger.debug(`docs:fireChangeNakoRuntime(${doc.uri.fsPath}:${nakoRuntime})`)
        this.emit('changeNakoRuntime', { fileName: doc.uri.fsPath, uri: doc.uri, nakoRuntime })
    }

    closeAtDocument (document: TextDocument):void {
        const fileName = document.uri.toString()
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        const doc = this.get(document)
        if (doc && doc.isTextDocument) {
            doc.isTextDocument = false
            if (doc.link.importBy.size > 0) {
                console.log(`document close: no close: import by other(${fileName})`)
                return
            }
        }
        this.trushDocument(fileName, doc)
        console.log(`document close: closed(${fileName})`)
        nako3diagnostic.refreshDiagnostics()
    }

    closeAtFile (uri: Uri):void {
        const fileName = uri.toString()
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        const doc = this.get(uri)
        if (doc) {
            if (doc.isTextDocument) {
                console.log(`document close: no close: document is textDocument(${fileName})`)
                return
            }
            if (doc.link.importBy.size > 0) {
                console.log(`document close: no close: import by other(${fileName})`)
                return
            }
        }
        this.trushDocument(fileName, doc)
        console.log(`document close: closed(${fileName})`)
        nako3diagnostic.refreshDiagnostics()
    }

    /**
     * クローズを際にTextDocument/Uri共通で必要な処理をまとめたもの。
     * @param fileName Uri.toString()をしたもの。内部での管理キー。
     * @param doc クローズするファイルのNako3DocumentExt(Uriベースの場合は不要)
     * @returns 登録したNako3DocumentExtを返す
     */
    private trushDocument (fileName: string, doc?: Nako3DocumentExt):void {
        if (doc) {
            doc.nako3doc.onTextUpdated = null
            doc.link.importPlugins.clear()
            doc.link.importNako3s.clear()
        }
        for (const [ , doc ] of this.docs) {
            if (doc.link.importBy.has(fileName)) {
                doc.link.importBy.delete(fileName)
            }
        }
        this.docs.delete(fileName)
    }

    async updateText (doc: Nako3DocumentExt, document: Uri|TextDocument, canceltoken?: CancellationToken): Promise<boolean> {
        return await doc.updateText(document, canceltoken)
    }

    has (document: TextDocument|Uri): boolean {
        return this.docs.has(this.getFileName(document))
    }

    get (document: TextDocument|Uri): Nako3DocumentExt|undefined {
        return this.docs.get(this.getFileName(document))
    }

    getFileName (doc: TextDocument|Uri): string {
        return doc instanceof Uri ? doc.toString() : doc.uri.toString()
    }

    getUri (doc: TextDocument|Uri): Uri {
        return doc instanceof Uri ? doc : doc.uri
    }

    updateNakoRuntime(doc: Nako3DocumentExt) {
        const nakoRuntime = doc.nako3doc.moduleEnv.nakoRuntime
        if (nakoRuntime !== doc.nakoRuntime) {
            doc.nakoRuntime = nakoRuntime
            this.fireChangeNakoRuntime(doc, nakoRuntime)
        }
    }

    async analyze(doc: Nako3DocumentExt, canceltoken?: CancellationToken): Promise<void> {
        logger.info(`interface:analyze:start:${doc.uri.toString()}`)
        doc.nako3doc.tokenize(canceltoken)
        await this.refreshLink(doc)
  
        if (doc.nako3doc.preNakoRuntime instanceof Array && doc.nako3doc.preNakoRuntime.length > 0) {
            doc.nako3doc.moduleEnv.nakoRuntime = doc.nako3doc.preNakoRuntime[0]
        } else if (typeof doc.nako3doc.preNakoRuntime === 'string' && doc.nako3doc.preNakoRuntime !== '') {
            doc.nako3doc.moduleEnv.nakoRuntime = doc.nako3doc.preNakoRuntime
        } else {
            doc.nako3doc.moduleEnv.nakoRuntime = ''
        }

        if (doc.nako3doc.moduleEnv.nakoRuntime === '') {
            doc.nako3doc.moduleEnv.nakoRuntime = nako3extensionOption.defaultNakoRuntime
        }
        this.updateNakoRuntime(doc)
        doc.nako3doc.parse(canceltoken)
        doc.nako3doc.applyVarConst(canceltoken)
        logger.info(`interface:analyze:end  :${doc.uri.toString()}`)
    }

    async analyzeToSetNakoRuntime(doc: Nako3DocumentExt, canceltoken?: CancellationToken): Promise<void> {
        logger.info(`interface:analyze1:start:${doc.uri.toString()}`)
        doc.nako3doc.tokenize(canceltoken)
        if (doc.nako3doc.moduleEnv.nakoRuntime === '') {
            doc.nako3doc.moduleEnv.nakoRuntime = nako3extensionOption.defaultNakoRuntime
        }
        this.updateNakoRuntime(doc)
    }

    async refreshLink(doc: Nako3DocumentExt): Promise<void> {
        const imports = doc.nako3doc.importStatements
        doc.errorInfos.clear()
        const nako3list: ImportStatementInfo[] = []
        const pluginlist: ImportStatementInfo[] = []
        let r: RegExpExecArray | null
        for (const importInfo of imports) {
            const imp = importInfo.value
            let type: 'js'|'nako3'|'' = ''
            if (/\.nako3?$/.test(imp)) {
                type = 'nako3'
            } else {
                r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
                if (r && r.length > 1 && r[1] != null) {
                    type = 'js'
                }
                r = /[\\\/]?(([^\\\/]*)(\.(js|mjs|cjs))?)$/.exec(imp)
                if (r && r.length > 1 && r[1] != null) {
                    type = 'js'
                }
            }

            if (type === 'nako3') {
                nako3list.push(importInfo)
            } else  if (type === 'js') {
                pluginlist.push(importInfo)
            } else {
                doc.errorInfos.add('WARN', 'unknownImport', { file: imp }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
            }
        }
        await this.importPlugins(doc, pluginlist)
        await this.importNako3s(doc, nako3list)
    }

    async importPlugins(doc: Nako3DocumentExt, imports: ImportStatementInfo[]): Promise<void> {
        const moduleEnv = doc.nako3doc.moduleEnv
        doc.link.importPlugins.clear()
        moduleEnv.pluginNames.length = 0
        console.log(`refreshLink: pluginNames cleared`)
        let r: RegExpExecArray | null
        for (const importInfo of imports) {
            const imp = importInfo.value
            const info : ImportPlugin = {
                importKey: imp,
                type: 'js',
                pluginKey: imp,
                existFile: false,
                filepath: '',
                hasCommandInfo: false,
                startLine: importInfo.startLine,
                startCol: importInfo.startCol,
                endLine: importInfo.endLine,
                endCol: importInfo.endCol,
                wasErrorReported: false
            }
            r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
            if (r && r.length > 1 && r[1] != null) {
                const pluginName = r[1]
                logger.info(`imports:check js plugin with plugin name:${pluginName}`)
                // Nako3Pluginに既にあるかどうかを名前でチェック。
                // 既にあるならそれをそのまま使う。
                if (nako3plugin.has(pluginName)) {
                    moduleEnv.pluginNames.push(pluginName)
                    info.pluginKey = pluginName
                    info.hasCommandInfo = true
                    logger.info(`imports: already resist plugin("${pluginName}")`)
                }
            }
            r = /[\\\/]?(([^\\\/]*)(\.(js|mjs|cjs))?)$/.exec(imp)
            if (r && r.length > 1 && r[1] != null) {
                const pluginFilename = r[1]
                logger.info(`imports:add js plugin without plugin name:${pluginFilename}`)
                let filepath = await nako3plugin.importFromFile(imp, doc.link, doc.errorInfos)
                if (filepath !== null) {                                  
                    info.existFile = true
                    info.filepath = filepath
                    moduleEnv.pluginNames.push(filepath)
                    nako3plugin.registPluginMap(doc.link.filePath, imp, filepath)
                    if (nako3plugin.has(filepath)) {
                        if (!info.hasCommandInfo) {
                            info.pluginKey = filepath
                        }
                        info.hasCommandInfo = true
                    } else {
                        doc.errorInfos.add('WARN', 'noPluginInfo', { plugin: pluginFilename }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                        info.wasErrorReported = true
                    }
                } else {
                    // this.errorInfos.add('WARN', 'noSupport3rdPlugin', { plugin }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                    logger.info(`ImportPlugins: error import 3rd plugin "${pluginFilename}"`)
                    if (info.hasCommandInfo) {
                        doc.errorInfos.add('WARN', 'warnImport3rdPlugin', { plugin: pluginFilename }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                    } else {
                        doc.errorInfos.add('ERROR', 'errorImport3rdPlugin', { plugin: pluginFilename }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                    }
                    info.wasErrorReported = true
                    info.filepath = pluginFilename
                    moduleEnv.pluginNames.push(pluginFilename)
                }
                doc.link.importPlugins.set(imp, info)
            } else {
                doc.errorInfos.add('WARN', 'unknownImport', { file: imp }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
            }
        }
    }

    async importNako3s(doc: Nako3DocumentExt, imports: ImportStatementInfo[]): Promise<void> {
        doc.link.importNako3s.clear()
        const dependNako3UriList = this.getDependNako3UriList(doc, imports)
        this.refreshNako3InLink(doc, dependNako3UriList)
        let exist = false
        let currentImportList:DependNako3Info[] = dependNako3UriList
        const alreadyImportedList:DependNako3Info[] = [...currentImportList]
        let newNakoUriList:DependNako3Info[] = []
        let tickCount = 0
        while (currentImportList.length > 0) {
            console.log(`refreshLink:Nako3:tick=${tickCount}, count=${currentImportList.length}`)
            for (const uriInfo of currentImportList) {
                const target = await this.importNako3(doc, uriInfo)
                if (target) {
                    exist = true
                    for (const [ uriStr, ] of target.nako3doc.moduleEnv.externalThings) {
                        const uri = Uri.parse(uriStr)
                        let alreadyExist = false
                        for (const info of newNakoUriList) {
                            if (uriStr === info.uri.toString()) {
                                alreadyExist = true
                                break
                            }
                        }
                        if (!alreadyExist) {
                            for (const uriInfo of alreadyImportedList) {
                                if (uriStr === uriInfo.uri.toString()) {
                                    alreadyExist = true
                                    break
                                }
                            }
                        }
                        if (!alreadyExist) {
                            newNakoUriList.push({uri})
                        }
                    }
                }
            }
            alreadyImportedList.push(...currentImportList)
            currentImportList = newNakoUriList
            newNakoUriList = []
            tickCount++
        }
        if (exist) {
            doc.nako3doc.validAst = false
            doc.nako3doc.validApplyerFuncToken = false
            doc.nako3doc.validApplyerVarToken = false
        }
    }                                       

    private getDependNako3UriList(doc: Nako3DocumentExt, imports: ImportStatementInfo[]): DependNako3Info[] {
        const dependUriList: DependNako3Info[] = []
        const pushDepend = (dependInfo: DependNako3Info|DependNako3Info[]) => {
            const pushIfNotExist = (info: DependNako3Info) => {
                for (const d of dependUriList) {
                    if (info.uri.toString() === d.uri.toString()) {
                        return
                    }
                }
                dependUriList.push(info)
            }
            if (dependInfo instanceof Array) {
                for (const info of dependInfo) {
                    pushIfNotExist(info)
                }
            } else {
                pushIfNotExist(dependInfo)
            }
        }
        const getDependUriList = (impUri: Uri): DependNako3Info[] => {
            const target = this.get(impUri)
            const dependUriList: DependNako3Info[] = []
            if (target) {
                console.log(`document exist ${impUri.toString()}`)
                for (const [ uriStr, ] of target.nako3doc.moduleEnv.externalThings) {
                    const uri = Uri.parse(uriStr)
                    console.log(`document exist and exist extern ${uriStr}`)
                    pushDepend({ uri })
                    pushDepend(getDependUriList(uri))
                }
            }
            return dependUriList
        } 
        for (const info of imports) {
            const imp = info.value
            if (/\.nako3?$/.test(imp)) {
                let isRemote = false
                if (imp.startsWith('http://') || imp.startsWith('https://')) {
                    isRemote = true
                }
                let impUri : Uri
                if (isRemote) {
                    impUri = Uri.parse(imp)
                } else {
                    impUri = Uri.joinPath(doc.nako3doc.link.uri, "..", imp)
                }
                pushDepend({ uri: impUri, importKey: info.value, range: Nako3Range.fromToken(info as unknown as Token) })
                pushDepend(getDependUriList(impUri))
            }
        }
        return dependUriList
    }

    private refreshNako3InLink (doc: Nako3DocumentExt, dependUriList: DependNako3Info[]) {
        const deleteList: string[] = []
        for (const [ uri, ] of doc.nako3doc.moduleEnv.externalThings) {
            let uriExist = false
            for (const dependUri of dependUriList) {
                if (uri === dependUri.toString()) {
                    uriExist = true
                    const target = this.get(dependUri.uri)
                    if (target) {
                        if (target.nako3doc.link.importBy.has(doc.uri.toString())) {
                            target.nako3doc.link.importBy.delete(doc.uri.toString())
                        }
                    }
                }
            }
            if (!uriExist) {
                deleteList.push(uri)
            }
        }
        for (const deleteKey of deleteList) {
            doc.nako3doc.moduleEnv.externalThings.delete(deleteKey)
        }
    }

    async importNako3(doc: Nako3DocumentExt, info: DependNako3Info): Promise<Nako3DocumentExt|null> {
        const bindDocument = (doc: Nako3DocumentExt, impUri: Uri, target: Nako3DocumentExt) => {
            if (!doc.nako3doc.moduleEnv.externalThings.has(impUri.toString())) {
                const info: ExternalInfo = {
                    uri: impUri,
                    filepath: impUri.toString(),
                    things: target.nako3doc.moduleEnv.declareThings,
                    funcSid: target.nako3doc.moduleEnv.declareFuncSid,
                    allSid: target.nako3doc.moduleEnv.declareAllSid
                }
                doc.nako3doc.moduleEnv.externalThings.set(impUri.toString(), info)
            }
            if (!target.nako3doc.link.importBy.has(doc.uri.toString())) {
                target.nako3doc.link.importBy.add(doc.uri.toString())
            }
        }
        const unbindDocument = (doc: Nako3DocumentExt, impUri: Uri) => {
            if (doc.nako3doc.moduleEnv.externalThings.has(impUri.toString())) {
                doc.nako3doc.moduleEnv.externalThings.delete(impUri.toString())
            }
        }
        let wasErrorReported = false
        const impUrl = info.uri.toString()
        let isRemote = false
        if (impUrl.startsWith('http://') || impUrl.startsWith('https://')) {
            isRemote = true
            if (!nako3extensionOption.enableNako3FromRemote) {
                if (!wasErrorReported) {
                    if (info.range) {
                        doc.errorInfos.add('WARN', 'disabledImportFromRemoteNako3', { file: info.uri.toString() }, info.range.startLine, info.range.startCol, info.range.endLine, info.range.endCol)
                    }
                    wasErrorReported = true
                }
                return null
            }
        }
        if (!wasErrorReported) {
            let impUri : Uri = info.uri
            const target = this.get(impUri)
            if (target) {
                logger.info(`refreshLink: found in docs(${impUri.toString()})`)
                bindDocument(doc, impUri, target)
                if (!target.isTextDocument && (!isRemote || target.nako3doc.text === '')) {
                    await target.updateText(impUri)
                }
                // await this.analyzeToSetNakoRuntime(target)
                await this.analyze(target)
                logger.info(`importNako3: success return(${impUri.toString()})`)
                return target
            } else {
                logger.info(`importNako3: open from file(${impUri.toString()})`)
                let target:Nako3DocumentExt|null
                try {
                    console.log('before stat')
                    if (isRemote) {
                        const response = await fetch(impUri.toString())
                        if (response.status !== 200) {
                            throw new Error('NOENT: file not found in url')
                        }
                    } else {
                        await workspace.fs.stat(impUri)
                    }
                    console.log('after  stat')
                    target = this.openFromFile(impUri)
                } catch (err) {
                    logger.info(`importNako3: failed(${impUri.toString()})`)
                    console.log(err)
                    if (err instanceof Error) {
                        if (err.message.indexOf('NOENT') >= -1) {
                            if (!wasErrorReported) {
                                if (info.range) {
                                    doc.errorInfos.add('ERROR', 'noImportNako3file', { file: impUri.toString() }, info.range.startLine, info.range.startCol, info.range.endLine, info.range.endCol)
                                }
                                wasErrorReported = true
                            }
                        } else {
                            console.log(`importNako3: cause error in openFromFile`)
                            console.log(err)
                        }
                    }
                    if (!wasErrorReported) {
                        if (info.range) {
                            doc.errorInfos.add('ERROR', 'errorImportNako3file', { file: impUri.toString() }, info.range.startLine, info.range.startCol, info.range.endLine, info.range.endCol)
                        }
                        wasErrorReported = true
                    }
                    unbindDocument(doc, impUri)
                    target = null
                }
                if (target) {
                    logger.info(`importNako3: open successed(${impUri.toString()})`)
                    try {
                        bindDocument(doc, impUri, target)
                        if (!target.isTextDocument) {
                            await target.updateText(impUri)
                        }
                        // await this.analyzeToSetNakoRuntime(target)
                        await this.analyze(target)
                        logger.info(`importNako3: success return(${impUri.toString()})`)
                        return target
                    } catch (err) {
                        logger.info(`importNako3: failed(${impUri.toString()})`)
                        unbindDocument(doc, impUri)
                        this.closeAtFile(impUri)
                        console.log(`importNako3: cause error in new open file(${impUri.toString()})`)
                        console.log(err)
                    }
                }
            }
        }
        return null
    }
}

export const nako3docs = new Nako3Documents()
