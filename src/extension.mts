import * as vscode from 'vscode'

import { Nako3DocumentExt } from './nako3documentext.mjs'
import { nadesiko3, TerminalExt } from './nako3nadesiko3.mjs'
import { showMessage } from './nako3message.mjs'
import { nako3extensionOption, configurationInitialize, configurationChanged } from './nako3option.mjs'
import { initialize as pluginInitialize } from './nako3plugin_builtin.mjs'
import { Nako3DocumentHighlightProvider } from './provider/nako3documenthighlightprovider.mjs'
import { Nako3DocumentSemanticTokensProvider, legend } from './provider/nako3documentsemantictokensprovider.mjs'
import { Nako3DocumentSymbolProvider } from './provider/nako3documentsymbolprovider.mjs'
import { Nako3HoverProvider } from './provider/nako3hoverprovider.mjs'
import { Nako3DefinitionProvider } from './provider/nako3definitionprovider.mjs'
import { Nako3ReferenceProvider } from './provider/nako3referenceprovider.mjs'
import { Nako3RenameProvider } from './provider/nako3renameprovider.mjs'

import { nako3docs } from './nako3interface.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { logger } from './logger.mjs'

import type { NakoRuntime } from './nako3types.mjs'

const NAKO3_MODE = { scheme: 'file', language: 'nadesiko3' }

let nako3RuntimeStatusBarItem: vscode.StatusBarItem

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

async function getNakoRuntimeFromFile (uri: vscode.Uri): Promise<NakoRuntime> {
    let runtime: NakoRuntime = ''
    try {
        const bin = await vscode.workspace.fs.readFile(uri)
        const decoder = new TextDecoder('utf-8')
        const text = decoder.decode(bin)
        const r = text.match(/([^\r\n]*)(\r|\n)/)
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
    let document = vscode.workspace.textDocuments.find(f => f.uri.toString() === uri.toString())
    if (document && nako3docs.has(document)) {
        logger.log(`command:nadesiko3.exec:has document`)
        // execute from editor's text
        doc = nako3docs.get(document)
        if (doc) {
            const nakoRuntime = doc.nako3doc.nakoRuntime
            if (nakoRuntime === '') {
                showMessage('WARN', 'unknownRuntime', {})
                return
            }
            if (nakoRuntime === 'wnako') {
                showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
                return
            }
            if (doc.isDirty) {
                logger.log(`command:nadesiko3.exec:is dirty`)
                const text = document.getText()
                await nadesiko3.execForText(text, document.uri, nakoRuntime)
                // showMessage('WARN', 'documnetIsDirty', {})
                // return
            } else {
                await nadesiko3.execForFile(uri, nakoRuntime)
           }
        }
    } else {
        // execute from explorer file    
        logger.log(`command:nadesiko3.exec:hasn't document`)
        const nakoRuntime = await getNakoRuntimeFromFile(uri)
        if (nakoRuntime === '') {
            showMessage('WARN', 'unknownRuntime', {})
            return
        }
        if (nakoRuntime === 'wnako') {
            showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
            return
        }
        await nadesiko3.execForFile(uri, nakoRuntime)
    }
}

async function nako3TerminalClose(e: vscode.Terminal) {
    await nadesiko3.terminalClose(e)
}

export function activate(context: vscode.ExtensionContext):void {
    configurationInitialize()
    logger.info(`workspace is ${vscode.workspace.name}`)

    nadesiko3.setWorkspaceFolders(vscode.workspace.workspaceFolders)
    nako3diagnostic.setNako3Docs(nako3docs)
    pluginInitialize()


	// create a new status bar item that we can now manage
	nako3RuntimeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40)
	context.subscriptions.push(nako3RuntimeStatusBarItem)

    nako3docs.addListener('changeNakoRuntime', e => {
        logger.debug(`docs:onChangeNakoRuntime`)
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
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(NAKO3_MODE, new Nako3DefinitionProvider()))
    context.subscriptions.push(vscode.languages.registerReferenceProvider(NAKO3_MODE, new Nako3ReferenceProvider()))
    // context.subscriptions.push(vscode.languages.registerRenameProvider(NAKO3_MODE, new Nako3RenameProvider()))

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
        // console.log(`onDidOpenTextDocument  :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.openFromDocument(e)
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(e => {
        // console.log(`onDidCloseTextDocument :${e.languageId}:${e.fileName}`)
        if (e.languageId === 'nadesiko3') {
            nako3docs.closeAtDocument(e)
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        logger.log(`oonDidChangeTextDocument:${e.document.languageId}:${e.document.fileName}`)
        if (e.document.languageId === 'nadesiko3') {
            const doc = nako3docs.get(e.document)
            if (doc) {
                doc.isDirty = true
            }
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(e => {
        logger.log(`onDidSaveTextDocument:${e.languageId}:${e.fileName}`)
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

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(configurationChanged))
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
    if (nako3diagnostic) {
        nako3diagnostic[Symbol.dispose]()
    }
    if (nako3docs) {
        nako3docs[Symbol.dispose]()
    }
    return undefined
}

function updateNako3RunimeStatusBarItem(): void {
    const editor = vscode.window.activeTextEditor
    let nakoRuntime:NakoRuntime = ''
    if (editor) {
        const doc = nako3docs.get(editor.document)
        if (doc) {
            nakoRuntime = doc.nako3doc.nakoRuntime
        }
    }
    if (nakoRuntime !== '') {
        nako3RuntimeStatusBarItem.text = nakoRuntime
        nako3RuntimeStatusBarItem.show()
    } else {
        nako3RuntimeStatusBarItem.hide()
    }
}
