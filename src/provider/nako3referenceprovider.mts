import {
    CancellationToken,
    Location,
    Position,
    Range,
    ReferenceContext,
    ReferenceProvider,
    TextDocument,
    workspace
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { trimOkurigana, getScopeId } from '../nako3util.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3plugin } from '../nako3plugin.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { DeclareThing, GlobalVariable, GlobalConstant, LocalVariable, LocalVarConst } from '../nako3types.mjs'
import type { Token, TokenCallFunc, TokenRefVar, TokenRefFunc, Nako3TokenTypePlugin, Nako3TokenTypeApply } from '../nako3token.mjs'

export class Nako3ReferenceProvider implements ReferenceProvider {
    protected log = logger.fromKey('/provider/Nako3ReferenceProvider')

    async provideReferences(document: TextDocument, position: Position, context: ReferenceContext, canceltoken: CancellationToken): Promise<Location[]|null> {
        const log = this.log.appendKey('.provideReferences')

        log.info(`■ ReferenceProvider: provideReferences`)
        let refs: Location[]|null = null
        if (canceltoken.isCancellationRequested) {
            log.debug(`provideReferences: canceled begining`)
            return refs
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            log.info('provideReferences: before updateText')
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideReferences: canceled after updateText`)
                return refs
            }
            log.info('provideReferences: before tokenize')
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideReferences: canceled after tokenize`)
                return refs
            }
            log.info('provideReferences: before getReferences')
            refs = await this.getReferences(position, context, nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideReferences: canceled after getReferences`)
                return refs
            }
            log.info('provideReferences: before refreshDiagnostics')
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
        log.info('provideReferences: end')
		return refs
    }

    async getReferences (position: Position, context: ReferenceContext, doc: Nako3DocumentExt, canceltoken: CancellationToken): Promise<Location[]|null> {
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        
        if (token !== null) {
            if (['sys_func','sys_var','sys_const'].includes(token.type)) {
                const commandInfo = nako3plugin.getCommandInfo(token.value, doc.nako3doc.moduleEnv.pluginNames, doc.nako3doc.moduleEnv.nakoRuntime)
                if (!commandInfo) {
                    return null
                }
                return await this.enumlateReferences(doc, commandInfo, context, canceltoken)
            } else if (token.type === 'user_func') {
                const meta = (token as TokenCallFunc).meta
                return await this.enumlateReferences(doc, meta, context, canceltoken)
            } else if (['user_var', 'user_const'].includes(token.type)) {
                const meta = (token as TokenRefVar).meta
                return await this.enumlateReferences(doc, meta, context, canceltoken)
            } else if (token.type === 'FUNCTION_NAME') {
                const meta = (token as TokenRefFunc).meta
                return await this.enumlateReferences(doc, meta, context, canceltoken)
            }
        }
        return null
    }

    private getRangeFromTokenContent (token: Token|Nako3Range): Range {
        let range:Range
        if (!(token instanceof Nako3Range) && (token.josi !== '' && typeof token.josiStartCol === 'number')) {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.josiStartCol)
            range = new Range(startPos, endPos)
        } else if (typeof token.resEndCol === 'number') {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.resEndCol)
            range = new Range(startPos, endPos)
        } else {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.endCol)
            range = new Range(startPos, endPos)
        }
        return range
    }

    private async enumlateReferences (doc: Nako3DocumentExt, thing:DeclareThing|LocalVarConst, context: ReferenceContext, canceltoken: CancellationToken): Promise<Location[]> {
        let results: Location[] = []
        if (thing.type === 'func') {
            // function never local
            results = await this.enumlateRefFunction(thing as DeclareThing, context, canceltoken)
        } else if (thing.origin === 'plugin' || thing.origin === 'global') {
            // global thing without function
            results = await this.enumlateRefGlobalVar(thing as DeclareThing, context, canceltoken)
        } else {
            results = this.enumlateRefLocalVar(doc, thing as LocalVariable, context, canceltoken)
        }
        return results
    }

    /**
     * システム関数(Pluginの関数)とユーザ関数について参照箇所の一覧を生成して返す。
     * @param thing - 一覧化する対象の定義情報
     * @param context - 検索する際のオプション。定義自身を含むか含まないかがある。
     * @param canceltoken - 取り消しトークン。呼び元で取り消したらフラグが立つ。
     * @returns 参照箇所のUriとLine-Colの一覧。ない場合は空配列を返す。
     */
    private async enumlateRefFunction (thing:DeclareThing, context: ReferenceContext, canceltoken: CancellationToken): Promise<Location[]> {
        const log = this.log.appendKey('.enumlateRefFunction')
        const results: Location[] = []
        log.info(`enumlateRefFunction: call   findFiles`)
        const uris = await workspace.findFiles('**/*.nako3','**/node_modules/**', undefined, canceltoken)
        log.info(`enumlateRefFunction: return findFiles(${uris.length})`)
        let uristr: string
        if (thing.origin === 'plugin') {
            uristr = thing.uri ? thing.uri.toString() : 'builtin'
        } else {
            if (!thing.uri) {
                return results
            }
            uristr = thing.uri.toString()
        }
        for (const uri of uris) {
            log.info(`enumlateRefFunction: file "${uri.toString()}"`)
            if (canceltoken.isCancellationRequested) {
                return []
            }
            let doc: Nako3DocumentExt|undefined = nako3docs.get(uri)
            let requireClose = false
            if (!doc) {
                doc = nako3docs.openFromFile(uri)
                requireClose = true
                if (canceltoken.isCancellationRequested) {
                    return []
                }
            }
            try {
                if (!doc.isTextDocument) {
                    await doc.updateText(uri)
                    if (canceltoken.isCancellationRequested) {
                        return []
                    }
                }
                await nako3docs.analyze(doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    return []
                }
                if (thing.origin === 'plugin') {
                    // plugin-function
                    for (const token of doc.nako3doc.tokens) {
                        if (token.type === 'sys_func') {
                            const func = token as TokenCallFunc
                            if (thing.nameNormalized === func.meta.nameNormalized && uristr === (func.meta.uri ? func.meta.toString() : 'builtin')) {
                                const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                                results.push(loc)
                            }
                        }
                    }
                } else {
                    // user-function
                    for (const token of doc.nako3doc.tokens) {
                        if (token.type === 'user_func') {
                            const func = token as TokenCallFunc
                            if (func.meta.uri) {
                                if (thing.nameNormalized === func.meta.nameNormalized && uristr === func.meta.uri.toString()) {
                                    const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                                    results.push(loc)
                                }
                            }
                        } else if (context.includeDeclaration && token.type === 'FUNCTION_NAME') {
                            const func = token as TokenRefFunc
                            if (func.meta.uri && func.meta.range) {
                                if (thing.nameNormalized === func.meta.nameNormalized && uristr === func.meta.uri.toString()) {
                                    const loc = new Location(doc.uri, this.getRangeFromTokenContent(func.meta.range))
                                    results.push(loc)
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.log(`cause error in enumlateReferencesFunction`)
                console.log(err)
            } finally {
                if (requireClose) {
                    nako3docs.closeAtFile(uri)
                }
            } 
        }
        return results
    }

    private async enumlateRefGlobalVar (thing:DeclareThing, context: ReferenceContext, canceltoken: CancellationToken): Promise<Location[]> {
        const log = this.log.appendKey('.enumlateRefGlobalVar')
        const results: Location[] = []
        log.info(`enumlateRefGlobalVar: call   findFiles`)
        const uris = await workspace.findFiles('**/*.nako3','**/node_modules/**', undefined, canceltoken)
        log.info(`enumlateRefGlobalVar: return findFiles(${uris.length})`)
        let uristr: string
        let type: Nako3TokenTypePlugin|Nako3TokenTypeApply
        if (thing.origin === 'plugin') {
            uristr = thing.uri ? thing.uri.toString() : 'builtin'
            type = thing.type === 'var' ? 'sys_var' : 'sys_const' 
        } else {
            if (!thing.uri) {
                return results
            }
            uristr = thing.uri.toString()
            type = thing.type === 'var' ? 'user_var' : 'user_const' 
        }
        for (const uri of uris) {
            log.info(`enumlateRefGlobalVar: file "${uri.toString()}"`)
            if (canceltoken.isCancellationRequested) {
                return []
            }
            let doc: Nako3DocumentExt|undefined = nako3docs.get(uri)
            let requireClose = false
            if (!doc) {
                doc = nako3docs.openFromFile(uri)
                requireClose = true
                if (canceltoken.isCancellationRequested) {
                    return []
                }
            }
            try {
                if (!doc.isTextDocument) {
                    await doc.updateText(uri)
                    if (canceltoken.isCancellationRequested) {
                        return []
                    }
                }
                await nako3docs.analyze(doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    return []
                }
                if (thing.origin === 'plugin') {
                    // plugin-var/const
                    for (const token of doc.nako3doc.tokens) {
                        if (token.type === type) {
                            const vars =  token as TokenRefVar
                            const meta = vars.meta as GlobalVariable|GlobalConstant
                            if (meta.nameNormalized === thing.nameNormalized && (meta.uri ? meta.toString() : 'builtin') === uristr) {
                                const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                                results.push(loc)
                            }
                        }
                    }
                } else {
                    // user-global-var/const
                    for (const token of doc.nako3doc.tokens) {
                        if (token.type === type) {
                            const vars =  token as TokenRefVar
                            const meta = vars.meta as GlobalVariable|GlobalConstant
                            if (meta.uri) {
                                if (meta.nameNormalized === thing.nameNormalized && meta.uri.toString() === uristr) {
                                    if (thing.range && token.startLine === thing.range.startLine && token.startCol === thing.range.startCol && !context.includeDeclaration) {
                                        // tokenとmetaの位置が同じならば定義。
                                        continue
                                    }
                                    const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                                    results.push(loc)
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                log.error(`cause error in enumlateRefGlobalVar`)
                log.error(err)
            } finally {
                if (requireClose) {
                    nako3docs.closeAtFile(uri)
                }
            } 
        }
        return results
    }

    private enumlateRefLocalVar (doc: Nako3DocumentExt, thing:LocalVarConst, context: ReferenceContext, canceltoken: CancellationToken): Location[] {
        const log = this.log.appendKey('.enumlateRefLocalVar')
        const results: Location[] = []
        log.info(`enumlateRefLocalVar: start`)
        let type: Nako3TokenTypeApply
        type = thing.type === 'const' ? 'user_const' : 'user_var' 
        log.info(`enumlateRefLocalVar: find "${thing.name}" of "${type}" in "${thing.scopeId}"`)
        try {
            // user-global-var/const
            let i = 0
            for (const token of doc.nako3doc.tokens) {
                if (token.type === type) {
                    const vars =  token as TokenRefVar
                    const meta = vars.meta as LocalVariable
                    if (meta.name === thing.name && meta.scopeId === thing.scopeId) {
                        if (thing.range && token.startLine === thing.range.startLine && token.startCol === thing.range.startCol && !context.includeDeclaration) {
                            // tokenとmetaの位置が同じならば定義。
                            i++
                            continue
                        }
                        const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                        results.push(loc)
                    }
                } else if (context.includeDeclaration && thing.type === 'parameter' && token.type === 'FUNCTION_ARG_PARAMETER') {
                    const scopeId = getScopeId(i, doc.nako3doc.moduleEnv.scopeIdList)
                    if (trimOkurigana(token.value) === thing.name && scopeId === thing.scopeId) {
                        const loc = new Location(doc.uri, this.getRangeFromTokenContent(token))
                        results.push(loc)
                    }
                }
                i++
            }
        } catch (err) {
            log.error(`cause error in enumlateRefLocalVar`)
            log.error(err)
        } 
        return results
    }
}
