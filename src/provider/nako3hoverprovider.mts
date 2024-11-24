import {
    CancellationToken,
    Hover,
    HoverProvider,
    Position,
    Range,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { argsToString } from '../nako3util.mjs'
import { operatorCommand } from '../nako3operatorhint.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3plugin } from '../nako3plugin.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { nako3extensionOption } from '../nako3option.mjs'
import { logger } from '../logger.mjs'
import type { GlobalFunction, LocalVariable, LocalConstant } from '../nako3types.mjs'
import type { Token, TokenCallFunc, TokenRefVar } from '../nako3token.mjs'

export class Nako3HoverProvider implements HoverProvider {
    async provideHover(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<Hover|null> {
        logger.info(`■ HoverProvider: provideHover`)
        let hover: Hover|null = null
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideHover: canceled begining`)
            return hover
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideHover: canceled after updateText`)
                return hover
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideHover: canceled after tokenize`)
                return hover
            }
            hover = this.getHover(position, nako3doc)
            if (canceltoken.isCancellationRequested) {
                return hover
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
		return hover
    }

    getHover (position: Position, doc: Nako3DocumentExt): Hover|null {
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        
        if (token !== null) {
            if (['sys_func','sys_var','sys_const'].includes(token.type)) {
                const origin = (token as TokenCallFunc).meta.origin
                if (origin === 'plugin') {
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
                        const declfunc = commandInfo as GlobalFunction
                        if (declfunc.args && declfunc.args.length > 0) {
                            cmd = `命令 (${argsToString(declfunc.args)})${commandInfo.name}`
                        } else {
                            cmd = `命令 ${commandInfo.name}`
                        }
                    }
                    return new Hover([cmd, commandInfo.hint || ''], range)
                } else if (origin === 'system') {
                    const meta = (token as TokenCallFunc).meta
                    let range = this.getRangeFromTokenContent(token, col)
                    if (range === null) {
                        return null
                    }
                    let cmd:string
                    if (token.type === 'sys_var') {
                        cmd = `システム変数 ${meta.name}`
                    } else if (token.type === 'sys_const') {
                        cmd = `システム定数 ${meta.name}`
                    } else {
                        if (meta.args && meta.args.length > 0) {
                            cmd = `システム関数 (${argsToString(meta.args)})${meta.name}`
                        } else {
                            cmd = `システム関数 ${meta.name}`
                        }
                    }
                    return new Hover([cmd, ''], range)
                }
            } else if (['user_func', 'user_var', 'user_const'].includes(token.type)) {
                let cmd:string
                if (token.type === 'user_func') {
                    const meta = (token as TokenCallFunc).meta
                    if (!meta) {
                        return null
                    }
                    if (meta.args && meta.args.length > 0) {
                        cmd = `ユーザ関数 (${argsToString(meta.args)})${meta.name}`
                    } else {
                        cmd = `ユーザ関数 ${meta.name}`
                    }
                } else {
                    const meta = (token as TokenRefVar).meta
                    if (token.type === 'user_var') {
                        if (!(meta as LocalVariable).scopeId || (meta as LocalVariable).scopeId === 'global') {
                            cmd = `ユーザ変数 ${meta.name}`
                        } else {
                            cmd = `ローカル変数 ${meta.name}`
                        }
                    } else if (token.type === 'user_const') {
                        if (!(meta as LocalConstant).scopeId || (meta as LocalConstant).scopeId === 'global') {
                            cmd = `ユーザ定数 ${meta.name}`
                        } else {                        
                            cmd = `ローカル定数 ${meta.name}`
                        }
                    } else {
                        return null
                    }
                }
                let range = this.getRangeFromTokenContent(token, col)
                if (range === null) {
                    return null
                }
                return new Hover([cmd, ''], range)
            } else if (nako3extensionOption.useOperatorHint && token.group === '演算子') {
                let range = this.getRangeFromTokenContent(token, col)
                if (range === null) {
                    return null
                }
                const opeInfo = operatorCommand.get(token.type)
                if (!opeInfo) {
                    return null
                }
                let cmd: string = '演算子 「' + opeInfo.cmd.join('」「') + '」'
                let hint: string = opeInfo.hint
                return new Hover([cmd, hint || ''], range)
            }
        }
        return null
    }

    private getRangeFromTokenContent (token: Token, col: number): Range|null {
        let range:Range
        if (token.josi !== '' && typeof token.josiStartCol === 'number') {
            if (col < token.josiStartCol) {
                const startPos = new Position(token.startLine, token.startCol)
                const endPos = new Position(token.endLine, token.josiStartCol)
                range = new Range(startPos, endPos)
            } else {
                return null
            }
        } else {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.endCol)
            range = new Range(startPos, endPos)
        }
        return range
    }
}