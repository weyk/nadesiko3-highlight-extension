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
import { DeclareFunction } from '../nako3types.mjs'
import type { Token } from '../nako3token.mjs'

const kokomadePeirsStatements = [
    '回', '間', '繰返', '増繰返', '減繰返', '後判定', '反復', '実行速度優先', 'パフォーマンスモニタ適用', '条件分岐', '条件分岐-違えば'
]

interface Nako3SymbolInfo {
    name: string | null
    type: string
    token: Token
    level: number
}

interface semanticStackInfo {
    statement: string
    tokenIndex: number
    sameLine: string
    canChigaeba: boolean
    hasBody: boolean
}

export class Nako3DocumentSymbolProvider implements DocumentSymbolProvider {
    async provideDocumentSymbols(document: TextDocument, canceltoken: CancellationToken): Promise<SymbolInformation[] | DocumentSymbol[]> {
        let symbols: DocumentSymbol[] = []
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideDocumentSymbols: canceled begining`)
            return symbols
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentSymbols: canceled after updateText`)
                return symbols
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentSymbols: canceled after tokeninze`)
                return symbols
            }
            if (!nako3doc.cache.symbols || nako3doc.cache.symbolsSerialId !== nako3doc.nako3doc.applyerVarTokenSerialId) {
                const workSymbols = this.getSymbols(nako3doc)
                if (canceltoken.isCancellationRequested) {
                    return symbols
                }
                nako3doc.cache.symbols = workSymbols
                nako3doc.cache.symbolsSerialId = nako3doc.nako3doc.applyerVarTokenSerialId
                logger.info('call getSymbols')
            } else {
                logger.info('skip getSymbols')
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
            let func:DeclareFunction|null = null
            switch (thing.type) {
            case 'const':
                type = 'constant'
                break
            case 'var':
                type = 'variable'
                break
            case 'func':
                type = 'function'
                func = thing as DeclareFunction
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
                    const vars = moduleEnv.allVariables.get(scopeId)
                    if (vars) {
                        for (const [ varname, localvar ] of vars) {
                            if (localvar.range === null || localvar.type === 'parameter' || localvar.scopeId !== scopeId) {
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
