import {
    languages,
    workspace,
    DiagnosticCollection,
    DocumentHighlight,
    DocumentSymbol,
    Hover,
    Position,
    SemanticTokens,
    SemanticTokensBuilder,
    TextDocument,
    Uri
} from 'vscode'
import { EventEmitter } from 'node:events'
import { Nako3DocumentExt } from './nako3documentext.mjs'
import { Nako3Command } from './nako3command.mjs'
import { logger } from './logger.mjs'
import type { RuntimeEnv } from './nako3type.mjs'

export class Nako3Documents extends EventEmitter implements Disposable {
    runtimeEnv: RuntimeEnv
    useShebang: boolean
    problemsLimit: number
    docs: Map<string, Nako3DocumentExt>
    diagnosticsCollection: DiagnosticCollection
    commands: Nako3Command

    constructor () {
        super()
        // console.log('nako3documnets constructed')
        this.docs = new Map()
        this.diagnosticsCollection = languages.createDiagnosticCollection("nadesiko3")
        this.runtimeEnv = 'wnako3'
        this.useShebang = true
        this.problemsLimit = 100
        this.commands = new Nako3Command()
        this.commands.initialize()
    }

    [Symbol.dispose](): void {
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose()
        }
    }

    setRuntimeEnv (runtime: RuntimeEnv) {
        this.runtimeEnv = runtime
        for (const [ , doc] of this.docs) {
            doc.setRuntimeEnvDefault(runtime)
        }
    }

    setUseShebang (useShebang: boolean) {
        this.useShebang = useShebang
        for (const [ , doc] of this.docs) {
            doc.setUseShebang(useShebang)
        }
    }

    setProblemsLimit (limit: number) {
        this.problemsLimit = limit
        for (const [ , doc] of this.docs) {
            doc.setProblemsLimit(limit)
        }
    }

    openFromDocument (document: TextDocument|Uri):void {
        // console.log('document open:enter')
        const fileName = this.getFileName(document)
        const uri = this.getUri(document)
        const doc = new Nako3DocumentExt(document)
        this.docs.set(fileName, doc)
        doc.setRuntimeEnvDefault(this.runtimeEnv)
        doc.setUseShebang(this.useShebang)
        doc.nako3doc.lex.commands = this.commands
        doc.setProblemsLimit(this.problemsLimit)
        doc.nako3doc.addListener('changeRuntimeEnv', e => {
            logger.debug(`docs:onChangeRuntimeEnv`)
            this.fireChangeRuntimeEnv(fileName, uri, e.runtimeEnv)
        })
        // console.log('document open:leave')
    }

    fireChangeRuntimeEnv (fileName: string, uri: Uri, runtimeEnv: RuntimeEnv) {
        logger.debug(`docs:fireChangeRuntimeEnv(${fileName}:${runtimeEnv})`)
        this.emit('changeRuntimeEnv', { fileName, uri, runtimeEnv: runtimeEnv })

    }

    closeAtDocument (document: TextDocument):void {
        const fileName = this.getFileName(document)
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        this.docs.delete(fileName)
        // console.log('document close:leave')
    }

    closeAtFile (uri: Uri):void {
        const fileName = uri.fsPath
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        this.docs.delete(fileName)
    }

    get (document: TextDocument|Uri): Nako3DocumentExt|undefined {
        return this.docs.get(this.getFileName(document))
    }

    getFileName (doc: TextDocument|Uri): string {
        return doc instanceof Uri ? doc.fsPath : doc.fileName
    }

    getUri (doc: TextDocument|Uri): Uri {
        return doc instanceof Uri ? doc : doc.uri
    }

    async setFullText (document: TextDocument|Uri):Promise<void> {
        const doc = this.get(document)
        if (doc) {
            if (document instanceof Uri) {
                if (workspace) {
                    workspace.fs.stat(document).then(l => {
                        workspace.fs.readFile(document).then(value => {
                            doc.updateText(value.toString(), l.mtime)
                        })
                    })
                }
            } else {
                doc.updateText(document.getText(), document.version)
            }
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

    getDiagnostics (document?: TextDocument|Uri): DiagnosticCollection {
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
