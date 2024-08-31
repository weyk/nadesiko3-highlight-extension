import * as vscode from 'vscode'

import { legend } from './nako3documentext.mjs'
import { Nako3Documents } from './nako3interface.mjs'
import { logger } from './logger.mjs'

const NAKO3_MODE = { scheme: 'file', language: 'nadesiko3' }

const nako3docs: Nako3Documents = new Nako3Documents()

export class Nako3DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, canceltoken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        // console.log(`provide semantic tokens:${document.fileName}`)
        nako3docs.setFullText(document)
		const tokens = nako3docs.getSemanticTokens(document)
        nako3docs.getDiagnostics(document)
        return tokens
    }
}

export class Nako3DocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    async provideDocumentHighlights(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.DocumentHighlight[]> {
        // console.log(`provide document highlight:${document.fileName}`)
		nako3docs.setFullText(document)
		const highlight = nako3docs.getHighlight(document, position)
        nako3docs.getDiagnostics(document)
		return highlight
    }
}

export class Nako3DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        // console.log(`provide document symbol:${document.fileName}`)
		nako3docs.setFullText(document)
		const symbols = nako3docs.getSymbols(document)
        nako3docs.getDiagnostics(document)
		return symbols
    }
}

export class Nako3HoverProvider implements vscode.HoverProvider {
    async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover|null> {
        // console.log(`provide document symbol:${document.fileName}`)
		nako3docs.setFullText(document)
		const hover = nako3docs.getHover(document, position)
        nako3docs.getDiagnostics(document)
		return hover
    }
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

    const limit = conf.get('maxNumberOfProblems')
    if (typeof limit === 'number') {
        nako3docs.setProblemsLimit(limit)
    }
    const runtime = conf.get('runtimeMode')
    if (typeof runtime === 'string') {
        nako3docs.setRuntimeEnv(runtime)
    }
    for (const document of vscode.workspace.textDocuments) {
        // console.log(`  ${document.fileName}:${document.languageId}:${!document.isClosed}`)
        if (!document.isClosed && document.languageId === 'nadesiko3') {
            nako3docs.open(document)
        }
    }
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(NAKO3_MODE, new Nako3DocumentSemanticTokensProvider(), legend))
    context.subscriptions.push(vscode.languages.registerDocumentHighlightProvider(NAKO3_MODE, new Nako3DocumentHighlightProvider()))
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(NAKO3_MODE, new Nako3DocumentSymbolProvider()))
    context.subscriptions.push(vscode.languages.registerHoverProvider(NAKO3_MODE, new Nako3HoverProvider()))

    disposableSubscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
        // console.log(`onDidOpen  :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.open(e)
        }
    }))
    disposableSubscriptions.push(vscode.workspace.onDidCloseTextDocument(e => {
        // console.log(`onDidClose :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.close(e)
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
    disposableSubscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('nadesiko3Highlight.maxNumberOfProblems')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const limit = conf.get('maxNumberOfProblems')
            if (typeof limit === 'number') {
                nako3docs.setProblemsLimit(limit)
            }
        } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeMode')) {
            const conf = vscode.workspace.getConfiguration('nadesiko3Highlight')
            const runtime = conf.get('runtimeMode')
            if (typeof runtime === 'string') {
                nako3docs.setRuntimeEnv(runtime)
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
