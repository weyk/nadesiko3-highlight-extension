import {
    languages,
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    Disposable,
    Position,
    Range,
    CancellationToken
} from 'vscode'
import { setTimeout } from 'node:timers'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { ErrorInfoManager, ErrorInfoID, ErrorInfoRaw } from '../nako3errorinfo.mjs'
import { getMessageWithArgs } from '../nako3message.mjs'
import { Nako3Documents } from '../nako3interface.mjs'
import { nako3extensionOption } from '../nako3option.mjs'
import { logger } from '../logger.mjs'

export class Nako3Diagnostic implements Disposable {
    private diagnosticsCollection: DiagnosticCollection
    private requreRefreshDiagnostics: boolean
    private refreshTimer: NodeJS.Timeout|null
    private nako3docs: Nako3Documents|null
    protected log = logger.fromKey('/provider/Nako3Diagnostic')

    constructor () {
        this.diagnosticsCollection = languages.createDiagnosticCollection("nadesiko3")
        this.requreRefreshDiagnostics = false
        this.refreshTimer = null
        this.nako3docs = null
    }

    dispose(): void {
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose()
        }
    }
    
    setNako3Docs (nako3docs: Nako3Documents):void {
        this.nako3docs = nako3docs
    }

    public async refreshDiagnostics (canceltoken?: CancellationToken): Promise<void> {
        const log = this.log.appendKey('.refreshDiagnostics')
        log.trace(`interface:getDiagnostics:start`)
        if (!this.nako3docs) {
            return
        }
        for (const [ , doc] of this.nako3docs.docs) {
            if (doc.isTextDocument) {
                await this.nako3docs.analyze(doc)
            }
        }
        this.diagnosticsCollection.clear()
        for (const [ , doc] of this.nako3docs.docs) {
            if (doc.isTextDocument) {
                this.diagnosticsCollection.set(doc.uri, this.getDiagnosticsForDoc(doc))
            }
        }
        log.trace(`interface:getDiagnostics:create diagnostic collection`)
        return
    }

    public markRefreshDiagnostics ():void {
        this.requreRefreshDiagnostics = true
        if (this.refreshTimer !== null) {
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null
                if (this.requreRefreshDiagnostics) {
                    this.requreRefreshDiagnostics = false
                    this.refreshDiagnostics()
                }
            }, 100)
        }
    }

    private addDiagnosticsFromErrorInfos (diagnostics: Diagnostic[], errorInfos: ErrorInfoManager, limit: number): number {
        for (const errorInfo of errorInfos.getAll()) {
            if (limit <= 0) {
                break
            }
            const startPos = new Position(errorInfo.startLine, errorInfo.startCol)
            const endPos = new Position(errorInfo.endLine, errorInfo.endCol)
            const range = new Range(startPos, endPos)
            let message:string
            if (errorInfo.hasOwnProperty('messageId')) {
                message = getMessageWithArgs((errorInfo as ErrorInfoID).messageId, (errorInfo as ErrorInfoID).args)
            } else {
                message = (errorInfo as ErrorInfoRaw).message
            }
            let kind:DiagnosticSeverity
            switch (errorInfo.type) {
            case 'ERROR':
                kind = DiagnosticSeverity.Error
                break
            case 'WARN':
                kind = DiagnosticSeverity.Warning
                break
            case 'INFO':
                kind = DiagnosticSeverity.Information
                break
            case 'HINT':
                kind = DiagnosticSeverity.Hint
                break
            default:
                kind = DiagnosticSeverity.Information
            }
            diagnostics.push(new Diagnostic(range, message, kind))
            limit--
        }
        return limit
    }

    private getDiagnosticsForDoc (doc: Nako3DocumentExt): Diagnostic[] {
        const log = this.log.appendKey('.getDiagnosticsForDoc')
        const diagnostics: Diagnostic[] = []
        let problemsRemain = nako3extensionOption.problemsLimit

        log.trace(`docext:get problems from lexer ${doc.nako3doc.lexer.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.nako3doc.lexer.errorInfos, problemsRemain)

        log.trace(`docext:get problems from tokenFixer ${doc.nako3doc.fixer.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.nako3doc.fixer.errorInfos, problemsRemain)

        log.trace(`docext:get problems from doc ${doc.nako3doc.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.nako3doc.errorInfos, problemsRemain)

        log.trace(`docext:get problems from docext ${doc.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.errorInfos, problemsRemain)

        log.trace(`docext:get problems from tokenApplyer ${doc.nako3doc.applyer.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.nako3doc.applyer.errorInfos, problemsRemain)

        log.trace(`docext:get problems from parser ${doc.nako3doc.parser.errorInfos.count}/${problemsRemain}`)
        problemsRemain = this.addDiagnosticsFromErrorInfos(diagnostics, doc.nako3doc.parser.errorInfos, problemsRemain)

        return diagnostics
    }
}

export const nako3diagnostic = new Nako3Diagnostic()
