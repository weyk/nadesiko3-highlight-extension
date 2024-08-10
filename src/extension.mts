import * as vscode from 'vscode'
import { Nako3Document } from './nako3document.mjs'
import { legend } from './nako3interface.mjs'

const NAKO3_MODE = { scheme: 'file', language: 'nadesiko3' }

let nako3doc: Nako3Document<vscode.SemanticTokens>|null = null
export class Nako3DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, canceltoken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        // analyze the document and return semantic tokens
        // console.log('semantec syntax highlight: enter')
        if (nako3doc === null) {
            nako3doc = new Nako3Document(document.fileName)
        }
        nako3doc.updateText(document.getText())
        const tokensBuilder = new vscode.SemanticTokensBuilder(legend)
        const tokens = nako3doc.getSemanticTokens(tokensBuilder)
        // console.log('semantec syntax highlight: leave')
        return tokens
    }
}

export function activate(context: vscode.ExtensionContext):void {
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(NAKO3_MODE, new Nako3DocumentSemanticTokensProvider(), legend))
}

export function deactivate() {
    return undefined
}
