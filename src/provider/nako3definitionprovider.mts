import {
    CancellationToken,
    Definition,
    DefinitionLink,
    DefinitionProvider,
    Location,
    Position,
    Range,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { LocalVariable } from '../nako3types.mjs'
import type { TokenCallFunc, TokenRefVar } from '../nako3token.mjs'

export class Nako3DefinitionProvider implements DefinitionProvider {
    async provideDefinition(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<Definition | DefinitionLink[] | null> {
        logger.info(`■ DefinitionProvier: provideDefinition`)
        let definition: Definition|DefinitionLink[]|null = null
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideDefinition: canceled begining`)
            return definition
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDefinition: canceled after updateText`)
                return definition
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDefinition: canceled after tokenize`)
                return definition
            }
            definition = this.getDefinition(position, nako3doc)
            if (canceltoken.isCancellationRequested) {
                return definition
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
		return definition
    
    }

    getDefinition (position: Position, doc: Nako3DocumentExt): Definition|DefinitionLink[]|null {
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        
        if (token !== null) {
            /*if (['sys_func','sys_var','sys_const'].includes(token.type)) {
                const commandInfo = nako3plugin.getCommandInfo(token.value, doc.nako3doc.moduleEnv.pluginNames, doc.nako3doc.moduleEnv.nakoRuntime)
                if (!commandInfo) {
                    return null
                }
                let range = this.getRangeFromTokenContent(token, col)
                if (range === null) {
                    return null
                }
                let cmd:string
                if (token.type === 'sys_var') {
                    cmd = `変数 ${commandInfo.name}`
                } else if (token.type === 'sys_const') {
                    cmd = `定数 ${commandInfo.name}`
                } else {
                    const declfunc = commandInfo as DeclareFunction
                    if (declfunc.args && declfunc.args.length > 0) {
                        cmd = `命令 (${argsToString(declfunc.args)})${commandInfo.name}`
                    } else {
                        cmd = `命令 ${commandInfo.name}`
                    }
                }
                return new Hover([cmd, commandInfo.hint || ''], range)
            } else*/
            if (['user_func'].includes(token.type)) {
                const meta = (token as TokenCallFunc).meta
                if (!meta || !meta.range || !meta.uri) {
                    return null
                }
                let range = this.getRangeFromNako3Range(meta.range, col)
                if (range === null) {
                    return null
                }
                console.log('getDefinition: func hit')
                return new Location(meta.uri, range)
            } else  if (['user_var', 'user_const'].includes(token.type)) {
                const meta = (token as TokenRefVar).meta
                if (!meta || !meta.range) {
                    return null
                }
                if ((meta as any).scopeId != null && (meta as LocalVariable).scopeId === 'global') {
                    const thing = doc.nako3doc.moduleEnv.declareThings.get(meta.name)
                    if (thing && thing.uri) {
                        let range = this.getRangeFromNako3Range(thing.range, col)
                        if (range === null) {
                            return null
                        }
                        console.log('getDefinition: var hit in global scope')
                        return new Location(thing.uri, range)
                    }                                     
                } else {
                    let range = this.getRangeFromNako3Range(meta.range, col)
                    if (range === null) {
                        return null
                    }
                    console.log('getDefinition: var hit in local scope')
                    return new Location(doc.nako3doc.moduleEnv.uri, range)
                }
            }
        }
        return null
    }

    private getRangeFromNako3Range (nako3range: Nako3Range|null, col: number): Range|null {
        if (nako3range === null) {
            return null
        }
        let range:Range
        if (nako3range.resEndCol != null && col < nako3range.resEndCol) {
            const startPos = new Position(nako3range.startLine, nako3range.startCol)
            const endPos = new Position(nako3range.endLine, nako3range.resEndCol)
            range = new Range(startPos, endPos)
        } else {
            const startPos = new Position(nako3range.startLine, nako3range.startCol)
            const endPos = new Position(nako3range.endLine, nako3range.endCol)
            range = new Range(startPos, endPos)
        }
        return range
    }
}
