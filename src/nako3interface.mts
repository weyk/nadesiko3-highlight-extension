import {
    languages,
    DiagnosticCollection,
    DocumentHighlight,
    DocumentSymbol,
    Hover,
    Position,
    SemanticTokens,
    SemanticTokensBuilder,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from './nako3documentext.mjs'
import { Nako3Command } from './nako3command.mjs'

export class Nako3Documents implements Disposable {
    runtimeEnv: string
    problemsLimit: number
    docs: Map<string, Nako3DocumentExt>
    diagnosticsCollection: DiagnosticCollection
    commands: Nako3Command

    constructor () {
        // console.log('nako3documnets constructed')
        this.docs = new Map()
        this.diagnosticsCollection = languages.createDiagnosticCollection("nadesiko3")
        this.runtimeEnv = "wnako"
        this.problemsLimit = 100
        this.commands = new Nako3Command()
        this.commands.initialize()
    }

    [Symbol.dispose](): void {
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose()
        }
    }

    setRuntimeEnv (runtime: string) {
        this.runtimeEnv = runtime
        for (const [ , doc] of this.docs) {
            doc.setRuntimeEnv(runtime)
        }
    }

    setProblemsLimit (limit: number) {
        this.problemsLimit = limit
        for (const [ , doc] of this.docs) {
            doc.setProblemsLimit(limit)
        }
    }

    open (document: TextDocument):void {
        // console.log('document open:enter')
        const doc = new Nako3DocumentExt(document.fileName, document.uri)
        this.docs.set(document.fileName, doc)
        doc.setRuntimeEnv(this.runtimeEnv)
        doc.nako3doc.lex.commands = this.commands
        doc.setProblemsLimit(this.problemsLimit)
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

    getHover (document: TextDocument, position: Position): Hover|null {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getHover: document not opend`)
            return null
        }
        return doc.getHover(position)
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
