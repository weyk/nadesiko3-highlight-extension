import {
    CallHierarchyIncomingCall,
    CallHierarchyItem,
    CallHierarchyOutgoingCall,
    CallHierarchyProvider,
    CancellationToken,
    Location,
    Position,
    Range,
    SymbolKind,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Document } from '../nako3document.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { argsToString, getScopeId } from '../nako3util.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { Token, TokenRef, TokenLink, LinkDef, LinkRef, TokenDefFunc, TokenCallFunc } from '../nako3/nako3token.mjs'
import type { GlobalFunction } from '../nako3/nako3types.mjs'

export class Nako3CallHierarchyProvider implements CallHierarchyProvider {
  protected log = logger.fromKey('/provider/Nako3CallHierarchyProvider')

  async prepareCallHierarchy(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<CallHierarchyItem | CallHierarchyItem[]| null> {
        const log = this.log.appendKey('.prepareCallHierarchy')
        log.info(`■ CallHierarchyProvider: prepareCallHierarchy start`)
        try {
            let items: CallHierarchyItem[]|null = []
            if (canceltoken.isCancellationRequested) {
                log.debug(`prepareCallHierarchy: canceled begining`)
                return items
            }
            const nako3doc = nako3docs.get(document)
            if (nako3doc) {
                await nako3doc.updateText(document, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    log.debug(`prepareCallHierarchy: canceled adter updateText`)
                    return items
                }
                await nako3docs.analyze(nako3doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    log.debug(`prepareCallHierarchy: canceled after tokenize`)
                    return items
                }
                items = this.getCallHierarchyItem(position, nako3doc)
                if (canceltoken.isCancellationRequested) {
                    return items
                }
                await nako3diagnostic.refreshDiagnostics(canceltoken)
            }
            log.info(`■ CallHierarchyProvider: prepareCallHierarchy end  (count = ${items ? items.length : null})`)
            return items
        } catch (err) {
            log.error(`■ CallHierarchyProvider: prepareCallHierarchy exception`)
            log.error(err)
            throw err
        }
    }

    async provideCallHierarchyIncomingCalls(item: CallHierarchyItem, canceltoken: CancellationToken): Promise<CallHierarchyIncomingCall[]> {
        const log = this.log.appendKey('.provideCallHierarchyIncomingCalls')
        log.info(`■ CallHierarchyProvider: provideCallHierarchyIncomingCalls start`)
        try {
            let calls: CallHierarchyIncomingCall[]|null = []
            log.info(`■ CallHierarchyProvider: provideCallHierarchyIncomingCalls end  (count = ${calls ? calls.length : null})`)
            return calls
        } catch (err) {
            log.error(`■ CallHierarchyProvider: provideCallHierarchyIncomingCalls exception`)
            log.error(err)
            throw err
        }
    }

    async provideCallHierarchyOutgoingCalls(item: CallHierarchyItem, canceltoken: CancellationToken): Promise<CallHierarchyOutgoingCall[]|null> {
        const log = this.log.appendKey('.provideCallHierarchyOutgoingCalls')
        log.info(`■ CallHierarchyProvider: provideCallHierarchyOutgoingCalls start`)
        try {
            let calls: CallHierarchyOutgoingCall[]|null = []
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideCallHierarchyOutgoingCalls: canceled begining`)
                return calls
            }
            const nako3doc = nako3docs.get(item.uri)
            if (nako3doc) {
                await nako3doc.updateText(item.uri, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    log.debug(`provideCallHierarchyOutgoingCalls: canceled adter updateText`)
                    return calls
                }
                await nako3docs.analyze(nako3doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    log.debug(`provideCallHierarchyOutgoingCalls: canceled after tokenize`)
                    return calls
                }
                calls = this.getCallHierarchyOutgoingCalls(item, nako3doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    return calls
                }
                await nako3diagnostic.refreshDiagnostics(canceltoken)
            }
            log.info(`■ CallHierarchyProvider: prepareCallHierarchy end  (count = ${calls ? calls.length : null})`)
            return calls
        } catch (err) {
            log.error(`■ CallHierarchyProvider: prepareCallHierarchy exception`)
            log.error(err)
            throw err
        }
    }

    getCallHierarchyItemFromToken(doc: Nako3DocumentExt, token: Token, kind: SymbolKind): CallHierarchyItem|null {
        if (token === null) {
            return null
        }
        let meta: GlobalFunction
        if (token.type === 'FUNCTION_NAME') {
            meta = (token as TokenDefFunc).meta
        } else {
            meta = (token as TokenCallFunc).meta
        }
        let range:Range
        if (!meta.range) {
            return null
        }
        const startPos = new Position(meta.range.startLine, meta.range.startCol)
        const endPos = new Position(meta.range.endLine, meta.range.endCol)
        range = new Range(startPos, endPos)
        let cmd: string
        if (meta.args && meta.args.length > 0) {
            cmd = `(${argsToString(meta.args)})${meta.name}`
        } else {
            cmd = `()${meta.name}`
        }
        return new CallHierarchyItem(kind, token.value, cmd, doc.uri, range, range)
    }

    getCallHierarchyOutgoingCallFromToken(doc: Nako3DocumentExt, token: Token, kind: SymbolKind): CallHierarchyOutgoingCall|null {
        if (token === null) {
            return null
        }
        const to = this.getCallHierarchyItemFromToken(doc, token, SymbolKind.Function)
        if (to === null) {
            return null
        }
        let meta: GlobalFunction
        if (token.type === 'FUNCTION_NAME') {
            meta = (token as TokenDefFunc).meta
        } else {
            meta = (token as TokenCallFunc).meta
        }
        let range:Range
        if (!meta.range) {
            return null
        }
        const startPos = new Position(token.startLine, token.startCol)
        const endPos = new Position(token.endLine, token.resEndCol !== undefined ? token.resEndCol : token.endCol)
        range = new Range(startPos, endPos)
        let cmd: string
        if (meta.args && meta.args.length > 0) {
            cmd = `(${argsToString(meta.args)})${meta.name}`
        } else {
            cmd = `()${meta.name}`
        }
        return new CallHierarchyOutgoingCall(to, [range])
    }

    getCallHierarchyItem (position: Position, doc: Nako3DocumentExt): CallHierarchyItem[] {
        const log = this.log.appendKey('.getCallHierarchyItem')
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        const callHierarchyItemList: CallHierarchyItem[] = []
        if (!token) { return [] }
        if (!['user_func', 'sys_func', 'FUNCTION_NAME'].includes(token.type)) {
            log.info(`getCallHierarchyItem: unsupport type : ${token.type}`)
            return []
        }
        let a = this.getCallHierarchyItemFromToken(doc, token, SymbolKind.Function)
        if (a) {
            callHierarchyItemList.push(a)
        }
        return callHierarchyItemList
    }

    getCallHierarchyOutgoingCalls (item: CallHierarchyItem, doc: Nako3DocumentExt, canceltoken: CancellationToken): CallHierarchyOutgoingCall[]|null {
        const log = this.log.appendKey('.getCallHierarchyOutgoingCalls')
        const line = item.range.start.line
        const col = item.range.start.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        const callHierarchyOutgoingCall: CallHierarchyOutgoingCall[] = []
        if (!token) {
            log.info(`getCallHierarchyOutgoingCalls: fail token from item`)
            console.log(item)
            return null
        }
        const thing = (token as TokenDefFunc).meta as GlobalFunction
        let i = 0
        for (const token of doc.nako3doc.tokens) {
            const scopeId = getScopeId(i, doc.nako3doc.moduleEnv.scopeIdList)
            if (thing.scopeId === scopeId) {
                if (token.type === 'user_func') {
                    const meta = (token as TokenCallFunc).meta as GlobalFunction
                    const c = this.getCallHierarchyOutgoingCallFromToken(doc, token, SymbolKind.Function)
                    if (c) {
                        callHierarchyOutgoingCall.push(c)
                    } else {
                        log.info(`getCallHierarchyOutgoingCalls: fail calls from token`)
                        log.info(token)
                    }
                }
            }
            if (canceltoken.isCancellationRequested) {
                return null
            }
            i++
        }
        return callHierarchyOutgoingCall
    }
}
