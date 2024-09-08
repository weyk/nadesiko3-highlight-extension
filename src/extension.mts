import * as vscode from 'vscode'
import path from 'node:path'
import fs from 'node:fs/promises'

import { legend, Nako3DocumentExt } from './nako3documentext.mjs'
import { Nako3Documents } from './nako3interface.mjs'
import { logger } from './logger.mjs'
import { showMessage } from './nako3message.mjs'
import type { RuntimeEnv } from './nako3type.mjs'

const NAKO3_MODE = { scheme: 'file', language: 'nadesiko3' }

const nako3docs: Nako3Documents = new Nako3Documents()
let nako3RuntimeStatusBarItem: vscode.StatusBarItem

export class Nako3DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, canceltoken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        // console.log(`provide semantic tokens:${document.fileName}`)
        await nako3docs.setFullText(document)
		const tokens = nako3docs.getSemanticTokens(document)
        nako3docs.getDiagnostics(document)
        return tokens
    }
}

export class Nako3DocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    async provideDocumentHighlights(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.DocumentHighlight[]> {
        // console.log(`provide document highlight:${document.fileName}`)
		await nako3docs.setFullText(document)
		const highlight = nako3docs.getHighlight(document, position)
        nako3docs.getDiagnostics(document)
		return highlight
    }
}

export class Nako3DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        // console.log(`provide document symbol:${document.fileName}`)
		await nako3docs.setFullText(document)
		const symbols = nako3docs.getSymbols(document)
        nako3docs.getDiagnostics(document)
		return symbols
    }
}

export class Nako3HoverProvider implements vscode.HoverProvider {
    async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover|null> {
        // console.log(`provide document symbol:${document.fileName}`)
		await nako3docs.setFullText(document)
		const hover = nako3docs.getHover(document, position)
        nako3docs.getDiagnostics(document)
		return hover
    }
}

async function getRimtimeEnvFromFile (uri: vscode.Uri): Promise<RuntimeEnv> {
    let runtime: RuntimeEnv = ''
    try {
        const bin = await vscode.workspace.fs.readFile(uri)
        const decoder = new TextDecoder('utf-8')
        const text = decoder.decode(bin)
        const r = text.match(/([^\r\n]*)(r|\n)/)
        if (r && r.length > 0) {
            const topLine = r[0]
            if (topLine.startsWith('#!')) {
                if (topLine.indexOf('cnako3') >= 0) {
                    runtime = 'cnako3'
                } else if (topLine.indexOf('snako') >= 0) {
                    runtime = 'snako'
                }
            }
        }
    } catch (ex) {
        logger.info('getRuntimeFromFile: casuse error on file read')
        runtime = ''
    }
    return runtime
}

async function isNadesiko3folder (folderpath: string|null): Promise<boolean> {
    if (folderpath === null || folderpath === undefined || folderpath === '') {
        return false
    }
    const cnako = path.join(folderpath, 'bin', 'cnako3')
    try {
        let f = await fs.lstat(cnako)
        if (!f.isFile) {
            return false
        }
    } catch (ex) {
        return false
    }
    const cnakomjs = path.join(folderpath, 'src', 'cnako3.mjs')
    try {
        let f = await fs.lstat(cnako)
        if (!f.isFile) {
            return false
        }
    } catch (ex) {
        return false
    }
    return true
}

async function nako3commandExec (uri:vscode.Uri) {
    logger.debug(`command:nadesiko3.exec`)
    const startTime = new Date()
    let doc:Nako3DocumentExt|undefined
    let runtimeEnv: RuntimeEnv = ''
    let editor = vscode.window.activeTextEditor
    if (!editor || (uri && uri.fsPath !== editor.document.uri.fsPath)) {
        runtimeEnv = await getRimtimeEnvFromFile(uri)
    } else {
        if (editor.document.isDirty) {
            showMessage('WARN', 'documnetIsDirty', {})
            return
        }
        doc = nako3docs.get(editor.document)
    }
    if (doc && doc.nako3doc.runtimeEnv !== '') {
        runtimeEnv = doc.nako3doc.runtimeEnv
    }
    if (runtimeEnv === '') {
        showMessage('WARN', 'unknwonRuntime', {})
        return
    }
    if (runtimeEnv === 'wnako3') {
        showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
        return
    }
    const configNode = vscode.workspace.getConfiguration('nadesiko3Highlight.node')
    const configNako3 = vscode.workspace.getConfiguration('nadesiko3Highlight.nadesiko3')
    let nako3folder:string = ''
    const wsfolder = vscode.workspace.getWorkspaceFolder(uri)
    if (wsfolder) {
        nako3folder = path.resolve(wsfolder.uri.fsPath, path.join('node_modules', 'nadesiko3'))
        if (!await isNadesiko3folder(nako3folder)) {
            nako3folder = ''
        }
    }
    if (nako3folder === '') {
        nako3folder = configNako3.folder
        if (!await isNadesiko3folder(nako3folder)) {
            nako3folder = ''
        }
    }
    if (nako3folder === '') {
        showMessage('WARN', 'unknwonNadesiko3home', {})
        return
    }
    logger.debug(`command:nadesiko3.exec:nako3folder=${nako3folder}`)
    const fileName = uri.fsPath
    const dirName = path.dirname(fileName)
    let nodeBin = configNode.nodeBin
    if (nodeBin === null || nodeBin === undefined || nodeBin === '') {
        nodeBin = 'node'
    } 
    logger.debug(`command:nadesiko3.exec:nodeBin=${nodeBin}`)
    const cnako3 = path.resolve(nako3folder, path.join('src', 'cnako3.mjs'))
    const snako = path.resolve(nako3folder, path.join('core', 'command', 'snako.mjs'))
    const nako3exec = runtimeEnv === 'snako' ? snako : cnako3
    if (!dirName || dirName === '' || dirName === '.') {
        showMessage('WARN', 'unknwonCWD', {})
      return
    }
    const terminal = vscode.window.createTerminal(`nadesiko3 (${startTime.toLocaleTimeString()})`)
    terminal.show()
    terminal.sendText(`cd "${dirName}"`)
    terminal.sendText(`${nodeBin} "${nako3exec}" "${path.basename(fileName)}"`)
}

const disposableSubscriptions : vscode.Disposable[] = []
export function activate(context: vscode.ExtensionContext):void {
    const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
    const traceLevel = conf.get('trace')
    logger.info(`activate :workspace.trace:${traceLevel}`)
    if (typeof traceLevel === 'string') {
        let level:string
        if (traceLevel === 'all') {
            level = 'LOG'
        } else if (traceLevel === 'debug') {
            level = 'DEBUG'
        } else if (traceLevel === 'vervose') {
            level = 'INFO'
        } else if (traceLevel === 'messages') {
            level = 'ERROR'
        } else {
            level = 'NONE'
        }
        logger.setLevel(level)
    }
    logger.info(`workspace is ${vscode.workspace.name}`)

    const limit = conf.get('maxNumberOfProblems')
    if (typeof limit === 'number') {
        nako3docs.setProblemsLimit(limit)
    }
    let runtime = conf.get('runtimeMode')
    if (typeof runtime === 'string') {
        if (runtime === 'wnako') {
            runtime = 'wnako3'
        } else if (runtime === 'cnako') {
            runtime = 'cnako3'
        }
        if (runtime === 'wnako3' || runtime === 'cnako3' || runtime === 'snako' || runtime === '') {
            nako3docs.setRuntimeEnv(runtime)
        } else {
            nako3docs.setRuntimeEnv('wnako3')
        }
    } else {
        nako3docs.setRuntimeEnv('wnako3')
    }
    const useShebang = conf.get('runtimeUseShebang')
    if (typeof useShebang === 'boolean') {
        nako3docs.setUseShebang(useShebang)
    } else {
        nako3docs.setUseShebang(true)
    }
	// create a new status bar item that we can now manage
	nako3RuntimeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40)
	disposableSubscriptions.push(nako3RuntimeStatusBarItem)

    nako3docs.addListener('changeRuntimeEnv', e => {
        logger.debug(`docs:onChangeRuntimeEnv`)
        const editor = vscode.window.activeTextEditor
        if (editor) {
            if (editor.document) {
                if (editor.document.fileName === e.fileName) {
                    updateNako3RunimeStatusBarItem()
                }
            }
        }
    })
    for (const document of vscode.workspace.textDocuments) {
        // console.log(`  ${document.fileName}:${document.languageId}:${!document.isClosed}`)
        if (!document.isClosed && document.languageId === 'nadesiko3') {
            nako3docs.openFromDocument(document)
        }
    }
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(NAKO3_MODE, new Nako3DocumentSemanticTokensProvider(), legend))
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider(NAKO3_MODE, new Nako3DocumentHighlightProvider()))
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(NAKO3_MODE, new Nako3DocumentSymbolProvider()))
    context.subscriptions.push(vscode.languages.registerHoverProvider(NAKO3_MODE, new Nako3HoverProvider()))

    disposableSubscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
        // console.log(`onDidOpen  :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.openFromDocument(e)
        }
    }))
    disposableSubscriptions.push(vscode.workspace.onDidCloseTextDocument(e => {
        // console.log(`onDidClose :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.closeAtDocument(e)
        }
    }))
    disposableSubscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        logger.log(`onDidChange:${e.document.languageId}:${e.document.fileName}`)
        if (e.document.languageId === 'nadesiko3') {
        }
    }))
    disposableSubscriptions.push(vscode.window.tabGroups.onDidChangeTabs(e => {
        logger.log(`onTabChange:${e.opened.length}/${e.closed.length}/${e.changed.length}`)
        logger.log(`  ${e.opened[0].label}/${e.closed[0].label}/${e.changed[0].label}`)
        //console.log(e)

    }))
    context.subscriptions.push(vscode.commands.registerCommand('nadesiko3highlight.nadesiko3.exec', nako3commandExec))

    disposableSubscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('nadesiko3Highlight.maxNumberOfProblems')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const limit = conf.get('maxNumberOfProblems')
            if (typeof limit === 'number') {
                nako3docs.setProblemsLimit(limit)
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeMode')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            let runtime = conf.get('runtimeMode')
            if (typeof runtime === 'string') {
                if (runtime === 'wnako') {
                    runtime = 'wnako3'
                } else if (runtime === 'cnako') {
                    runtime = 'cnako3'
                }
                if (runtime === 'wnako3' || runtime === 'cnako3' || runtime === 'snako' || runtime === '') {
                    nako3docs.setRuntimeEnv(runtime)
                }
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeUseShebang')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const useShebang = conf.get('runtimeUseShebang')
            if (typeof useShebang === 'boolean') {
                nako3docs.setUseShebang(useShebang)
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.trace')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const traceLevel = conf.get('trace')

            console.log(`onDidChangeConnfiguratioon :workspace.trace:${traceLevel}`)
            if (typeof traceLevel === 'string') {
                let level:string
                if (traceLevel === 'all') {
                    level = 'LOG'
                } else if (traceLevel === 'debug') {
                    level = 'DEBUG'
                } else if (traceLevel === 'vervose') {
                    level = 'INFO'
                } else if (traceLevel === 'messages') {
                    level = 'ERROR'
                } else {
                    level = 'NONE'
                }
                logger.setLevel(level)
            }
        }
    }))
	// register some listener that make sure the status bar 
	// item always up-to-date
	disposableSubscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateNako3RunimeStatusBarItem))
	disposableSubscriptions.push(vscode.window.onDidChangeTextEditorSelection(updateNako3RunimeStatusBarItem))
    // disposableSubscriptions.push(vscode.window.tabGroups.onDidChangeTabGroups(e => {
    //     console.log(`onTabGroupChange:${e.opened.length}/${e.closed.length}/${e.changed.length}`)
    //     console.log(`  ${e.opened[0].activeTab}/${e.closed[0].activeTab}/${e.changed[0].activeTab}`)
    //     //console.log(e)
    // }))
    // disposableSubscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => {
    //     console.log(`changeActiveEdit:${e?.document.fileName}`)
    // }))
    //disposableSubscriptions.push(vscode.window.onDidChangeTextEditorSelection(e => {
    //     console.log(`changeSelection:${e.kind}/${e.selections[0].start}-${e.selections[0].end}`)
    //     // .textEditor.selection = e.selections[0]
    //}))
    // console.log(`initial tab count:${vscode.window.tabGroups.all.length}`)
    // for (const tabgorup of vscode.window.tabGroups.all) {
    //     console.log(`  ${tabgorup.tabs.length}`)
    //     for (const tab of tabgorup.tabs) {
    //         console.log(`    ${tab.label}`)
    //     }
    // }
    // console.log(`initial text document:${vscode.workspace.textDocuments.length}`)
}

export function deactivate() {
    for (const obj of disposableSubscriptions) {
        obj.dispose()
    }
    if (nako3docs) {
        nako3docs[Symbol.dispose]()
    }
    return undefined
}

function updateNako3RunimeStatusBarItem(): void {
    const editor = vscode.window.activeTextEditor
    let runtimeEnv:RuntimeEnv = ''
    if (editor) {
        const doc = nako3docs.get(editor.document)
        if (doc) {
            runtimeEnv = doc.nako3doc.runtimeEnv
        }
    }
    if (runtimeEnv !== '') {
        nako3RuntimeStatusBarItem.text = runtimeEnv
        nako3RuntimeStatusBarItem.show()
    } else {
        nako3RuntimeStatusBarItem.hide()
    }
}
