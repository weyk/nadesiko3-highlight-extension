import {
    CancellationToken,
    DocumentSymbol,
    DocumentSymbolProvider,
    Position,
    Range,
    SymbolInformation,
    SymbolKind,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { ModuleEnv } from '../nako3module.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { GlobalFunction } from '../nako3/nako3types.mjs'

export class Nako3DocumentSymbolProvider implements DocumentSymbolProvider {
    protected log = logger.fromKey('/provider/Nako3DocumentSymbolProvider')

    async provideDocumentSymbols(document: TextDocument, canceltoken: CancellationToken): Promise<SymbolInformation[] | DocumentSymbol[]> {
        const log = this.log.appendKey('.provideDocumentSymbols')
        log.info(`■ DocumentSymbolProvider: provideDocumentSymbols`)
        let symbols: DocumentSymbol[] = []
        if (canceltoken.isCancellationRequested) {
            log.debug(`provideDocumentSymbols: canceled begining`)
            return symbols
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideDocumentSymbols: canceled after updateText`)
                return symbols
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideDocumentSymbols: canceled after tokeninze`)
                return symbols
            }
            if (!nako3doc.cache.symbols || nako3doc.cache.symbolsSerialId !== nako3doc.nako3doc.applyerVarTokenSerialId) {
                const workSymbols = this.getSymbols(nako3doc)
                if (canceltoken.isCancellationRequested) {
                    return symbols
                }
                nako3doc.cache.symbols = workSymbols
                nako3doc.cache.symbolsSerialId = nako3doc.nako3doc.applyerVarTokenSerialId
                log.info('call getSymbols')
            } else {
                log.info('skip getSymbols')
            }
            symbols = nako3doc.cache.symbols
            if (canceltoken.isCancellationRequested) {
                return symbols
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
		return symbols
    }

    private getSymbols (doc: Nako3DocumentExt): DocumentSymbol[] {
        const moduleEnv = doc.nako3doc.moduleEnv
        const symbols = this.computeDocumentSymbols(moduleEnv)
        return symbols
    }

    private createDocumentSymbolFromNako3Range (name: string|null, type: string, nako3range: Nako3Range): DocumentSymbol {
        let kind:SymbolKind
        switch (type) {
        case 'function':
            kind = SymbolKind.Function
            break
        case 'variable':
            kind = SymbolKind.Variable
            break
        case 'constant':
            kind = SymbolKind.Constant
            break
        default:
            console.log(`createDocumentSymbolFromToken: UnknownType${type}`)
            kind = SymbolKind.Null
        }
        if (!name) {
            name = '<anonymous function>'
        }
        const start = new Position(nako3range.startLine, nako3range.startCol)
        const end = new Position(nako3range.endLine, nako3range.resEndCol)
        const range = new Range(start, end)
        const symbol = new DocumentSymbol(name, '', kind, range, range)
        return symbol
    }

    private computeDocumentSymbols(moduleEnv: ModuleEnv):DocumentSymbol[] {
        const documentSymbols: DocumentSymbol[] = []
        for (const [ , thing ] of moduleEnv.declareThings) {
            if (thing.range === null) {
                continue
            }
            let name = thing.nameNormalized
            let type:string
            let func:GlobalFunction|null = null
            switch (thing.type) {
            case 'const':
                type = 'constant'
                break
            case 'var':
                type = 'variable'
                break
            case 'func':
                type = 'function'
                func = thing as GlobalFunction
                if (func.isMumei) {
                    name = '<anonymous function>'
                }
                break
            default:
                type = ''
                console.log(`computeDocumetSymbols2: unknown type in thing:${(thing as any).type}`)
            }
            const containerSymbol = this.createDocumentSymbolFromNako3Range(name, type, thing.range)
            documentSymbols.push(containerSymbol)
            if (func) {
                const scopeId = func.scopeId
                if (scopeId) {
                    const vars = moduleEnv.allScopeVarConsts.get(scopeId)
                    if (vars) {
                        for (const [ varname, localvar ] of vars) {
                            if (localvar.type === 'parameter') {
                                continue
                            }
                            if (localvar.range === null || (localvar.scopeId !== scopeId && localvar.scopeId !== 'global')) {
                                if (localvar.origin !== 'system') {
                                    console.log(`computeDocumetSymbols2: illegal var`)
                                    console.log(localvar)
                                }
                                continue
                            }
                            let type:string
                            switch (localvar.type) {
                            case 'const':
                                type = 'constant'
                                break
                            case 'var':
                                type = 'variable'
                                break
                            default:
                                type = ''
                                console.log(`computeDocumetSymbols2: unknown type in localvar:${(localvar as any).type}`)
                            }
                            const symbol = this.createDocumentSymbolFromNako3Range(varname, type, localvar.range)
                            containerSymbol.children.push(symbol)
                        }
                    }
                }
            }
        }
        return documentSymbols
    }
}
