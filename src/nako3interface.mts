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
import type { RuntimeEnv } from './nako3types.mjs'

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
        this.runtimeEnv = 'wnako'
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
        const fileName = this.getFileName(document)
        const uri = this.getUri(document)
        if (!this.has(document)) {
            const doc = new Nako3DocumentExt(document)
            this.docs.set(fileName, doc)
            doc.setRuntimeEnvDefault(this.runtimeEnv)
            doc.setUseShebang(this.useShebang)
            doc.nako3doc.lex.commands = this.commands
            doc.nako3doc.parser.commands = this.commands
            doc.setProblemsLimit(this.problemsLimit)
            doc.nako3doc.addListener('changeRuntimeEnv', e => {
                logger.debug(`docs:onChangeRuntimeEnv`)
                this.fireChangeRuntimeEnv(fileName, uri, e.runtimeEnv)
            })
        } else {
            const doc = this.get(document)!
            if (!doc.isTextDocument) {
                doc.isTextDocument = true
            }
        }
    }

    openFromFile (uri: Uri):void {
        const fileName = this.getFileName(uri)
        if (!this.has(uri)) {
            const doc = new Nako3DocumentExt(uri)
            this.docs.set(fileName, doc)
            doc.setRuntimeEnvDefault(this.runtimeEnv)
            doc.setUseShebang(this.useShebang)
            doc.nako3doc.lex.commands = this.commands
            doc.nako3doc.parser.commands = this.commands
            doc.setProblemsLimit(this.problemsLimit)
            doc.nako3doc.addListener('changeRuntimeEnv', e => {
                logger.debug(`docs:onChangeRuntimeEnv`)
                this.fireChangeRuntimeEnv(fileName, uri, e.runtimeEnv)
            })
        }
    }

    fireChangeRuntimeEnv (fileName: string, uri: Uri, runtimeEnv: RuntimeEnv) {
        logger.debug(`docs:fireChangeRuntimeEnv(${fileName}:${runtimeEnv})`)
        this.emit('changeRuntimeEnv', { fileName, uri, runtimeEnv: runtimeEnv })
    }

    closeAtDocument (document: TextDocument):void {
        const fileName = document.fileName
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        const doc = this.get(document)
        if (doc && doc.isTextDocument) {
            doc.isTextDocument = false
        }
        this.docs.delete(fileName)
        this.getDiagnostics()
        console.log('document close:leave')
    }

    closeAtFile (uri: Uri):void {
        const fileName = uri.fsPath
        if (!this.docs.has(fileName)) {
            console.log(`document close: no open(${fileName})`)
        }
        this.docs.delete(fileName)
        this.getDiagnostics()
    }

    has (document: TextDocument|Uri): boolean {
        return this.docs.has(this.getFileName(document))
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
        logger.log(`interface:getDiagnostics:start`)
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
        logger.log(`interface:getDiagnostics:create diagnostic collection`)
        return this.diagnosticsCollection
    }
}
