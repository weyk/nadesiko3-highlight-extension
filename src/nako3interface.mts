import {
    languages,
    DiagnosticCollection,
    DocumentHighlight,
    DocumentSymbol,
    Position,
    SemanticTokens,
    SemanticTokensBuilder,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from './nako3documentext.mjs'

export class Nako3Documents implements Disposable {
    docs: Map<string, Nako3DocumentExt>
    diagnosticsCollection: DiagnosticCollection

    constructor () {
        // console.log('nako3documnets constructed')
        this.docs = new Map()
        this.diagnosticsCollection = languages.createDiagnosticCollection("nadesiko3")
    }

    [Symbol.dispose](): void {
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose()
        }
    }

    open (document: TextDocument):void {
        // console.log('document open:enter')
        this.docs.set(document.fileName, new Nako3DocumentExt(document.fileName, document.uri))
        // console.log('document open:leave')
    }

    close (document: TextDocument):void {
        if (!this.docs.has(document.fileName)) {
            console.log(`document close: no open(${document.fileName})`)
        }
        this.docs.delete(document.fileName)
    }

    get (document: TextDocument): Nako3DocumentExt|undefined {
        return this.docs.get(document.fileName)
    }

    setFullText (document: TextDocument):void {
        const doc = this.get(document)
        if (doc) {
            doc.updateText(document.getText(), document.version)
        } else {
            console.log(`setFullText: document not opend`)
        }
    }

    getSemanticTokens(document: TextDocument): SemanticTokens {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getSemanticTokens: document not opend`)
            const builder = new SemanticTokensBuilder()
            return builder.build()
        }
        return doc.getSemanticTokens()
    }

    getHighlight (document: TextDocument, position: Position): DocumentHighlight[] {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getHighlight: document not opend`)
            return []
        }
        return doc.getHighlight(position)
    }

    getSymbols (document: TextDocument): DocumentSymbol[] {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getSymbols: document not opend`)
            return []
        }
        return doc.getDocumentSymbols()
    }

    getDiagnostics (document?: TextDocument): DiagnosticCollection {
        this.diagnosticsCollection.clear()
        if (document) {
            const doc = this.get(document)
            if (doc == null) {
                console.log(`getDiagnostics: document not opend`)
            }
        }
        for (const [ , doc] of this.docs) {
            this.diagnosticsCollection.set(doc.uri, doc.getDiagnostics())
        }
        return this.diagnosticsCollection
    }
}
