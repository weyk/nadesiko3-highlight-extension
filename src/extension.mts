import * as vscode from 'vscode'

import { legend, Nako3DocumentExt } from './nako3documentext.mjs'
import { Nako3Documents } from './nako3interface.mjs'
import { logger } from './logger.mjs'
import { nadesiko3, TerminalExt } from './nako3nadesiko3.mjs'
import { showMessage } from './nako3message.mjs'

import type { RuntimeEnv } from './nako3types.mjs'

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

export class Nako3CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	]

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<(vscode.CodeAction | vscode.Command)[]> {
        throw new Error('Method not implemented.')
    }
    resolveCodeAction?(codeAction: vscode.CodeAction, token: vscode.CancellationToken): Promise<vscode.CodeAction> {
        throw new Error('Method not implemented.')
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
                    runtime = 'cnako'
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


async function nako3commandExec (uri:vscode.Uri) {
    logger.debug(`command:nadesiko3.exec`)
    let doc:Nako3DocumentExt|undefined
    const editor = vscode.window.activeTextEditor
    if (uri === undefined && editor) {
        uri = editor.document.uri
    }
    let document = vscode.workspace.textDocuments.find(f => f.fileName === uri.fsPath)
    if (document && nako3docs.has(document)) {
        logger.log(`command:nadesiko3.exec:has document`)
        // execute from editor's text
        doc = nako3docs.get(document)
        if (doc) {
            const runtimeEnv = doc.nako3doc.runtimeEnv
            if (runtimeEnv === '') {
                showMessage('WARN', 'unknownRuntime', {})
                return
            }
            if (runtimeEnv === 'wnako') {
                showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
                return
            }
            if (doc.isDirty) {
                logger.log(`command:nadesiko3.exec:is dirty`)
                const text = document.getText()
                await nadesiko3.execForText(text, document.uri, runtimeEnv)
                // showMessage('WARN', 'documnetIsDirty', {})
                // return
            } else {
                await nadesiko3.execForFile(uri, runtimeEnv)
           }
        }
    } else {
        // execute from explorer file    
        logger.log(`command:nadesiko3.exec:hasn't document`)
        const runtimeEnv = await getRimtimeEnvFromFile(uri)
        if (runtimeEnv === '') {
            showMessage('WARN', 'unknownRuntime', {})
            return
        }
        if (runtimeEnv === 'wnako') {
            showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
            return
        }
        await nadesiko3.execForFile(uri, runtimeEnv)
    }
}

async function nako3TerminalClose(e: vscode.Terminal) {
    await nadesiko3.terminalClose(e)
}

function configurationInitialize() {
    const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
    const traceLevel = conf.get('trace')
    logger.info(`activate :workspace.trace:${traceLevel}`)
    if (typeof traceLevel === 'string') {
        let level:string
        if (traceLevel === 'all') {
            level = 'LOG'
        } else if (traceLevel === 'debug') {
            level = 'DEBUG'
        } else if (traceLevel === 'verbose') {
            level = 'INFO'
        } else if (traceLevel === 'messages') {
            level = 'ERROR'
        } else {
            console.log(`trace level invalid(${traceLevel})`)
            level = 'NONE'
        }
        logger.setLevel(level)
    }
    const limit = conf.get('maxNumberOfProblems')
    if (typeof limit === 'number') {
        nako3docs.setProblemsLimit(limit)
    }
    let runtime = conf.get('runtimeMode')
    if (typeof runtime === 'string') {
        if (runtime === 'wnako3') {
            runtime = 'wnako'
        } else if (runtime === 'cnako3') {
            runtime = 'cnako'
        }
        if (runtime === 'wnako' || runtime === 'cnako' || runtime === 'snako' || runtime === '') {
            nako3docs.setRuntimeEnv(runtime)
        } else {
            nako3docs.setRuntimeEnv('wnako')
        }
    } else {
        nako3docs.setRuntimeEnv('wnako')
    }
    const useShebang = conf.get('runtimeUseShebang')
    if (typeof useShebang === 'boolean') {
        nako3docs.setUseShebang(useShebang)
    } else {
        nako3docs.setUseShebang(true)
    }
    const nadesiko3folder = conf.get('nadesiko3.folder')
    if (typeof nadesiko3folder === 'string') {
        nadesiko3.setNadesiko3Folder(nadesiko3folder)
    } else {
        nadesiko3.setNadesiko3Folder('')
    }
}

export function activate(context: vscode.ExtensionContext):void {
    configurationInitialize()
    logger.info(`workspace is ${vscode.workspace.name}`)

    nadesiko3.setWorkspaceFolders(vscode.workspace.workspaceFolders)

	// create a new status bar item that we can now manage
	nako3RuntimeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40)
	context.subscriptions.push(nako3RuntimeStatusBarItem)

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

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
        // console.log(`onDidOpen  :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.openFromDocument(e)
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(e => {
        // console.log(`onDidClose :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.closeAtDocument(e)
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        logger.log(`onDidChange:${e.document.languageId}:${e.document.fileName}`)
        if (e.document.languageId === 'nadesiko3') {
            const doc = nako3docs.get(e.document)
            if (doc) {
                doc.isDirty = true
            }
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(e => {
        logger.log(`onDidChange:${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            const doc = nako3docs.get(e)
            if (doc) {
                doc.isDirty = false
            }
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders( e => {
        if (e.removed.length > 0) {
            nadesiko3.removeWorkspaceFolders(e.removed)
        }
        if (e.added.length > 0) {
            nadesiko3.addWorkspaceFolders(e.added)
        }
    }))
    context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(e => {
        logger.log(`onTabChange:${e.opened.length}/${e.closed.length}/${e.changed.length}`)
        logger.log(`  ${e.opened[0].label}/${e.closed[0].label}/${e.changed[0].label}`)
        //console.log(e)
    }))
    context.subscriptions.push(vscode.commands.registerCommand('nadesiko3highlight.nadesiko3.exec', nako3commandExec))
    context.subscriptions.push(vscode.window.onDidCloseTerminal(nako3TerminalClose))

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
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
                if (runtime === 'wnako3') {
                    runtime = 'wnako'
                } else if (runtime === 'cnako3') {
                    runtime = 'cnako'
                }
                if (runtime === 'wnako' || runtime === 'cnako' || runtime === 'snako' || runtime === '') {
                    nako3docs.setRuntimeEnv(runtime)
                }
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeUseShebang')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const useShebang = conf.get('runtimeUseShebang')
            if (typeof useShebang === 'boolean') {
                nako3docs.setUseShebang(useShebang)
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.nadesiko3.folder')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight.nadesiko3')
            const nadesiko3folder = conf.get('folder')
            if (typeof nadesiko3folder === 'string') {
                nadesiko3.setNadesiko3Folder(nadesiko3folder)
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
                } else if (traceLevel === 'verbose') {
                    level = 'INFO'
                } else if (traceLevel === 'messages') {
                    level = 'ERROR'
                } else {
                    console.log(`trace level invalid(${traceLevel})`)
                    level = 'NONE'
                }
                logger.setLevel(level)
            }
        }
    }))
	// register some listener that make sure the status bar 
	// item always up-to-date
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateNako3RunimeStatusBarItem))
	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(updateNako3RunimeStatusBarItem))
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
