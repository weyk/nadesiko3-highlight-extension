import { MessageArgs } from './nako3message.mjs'
import type { SourceMap } from './nako3types.mjs'
import type { Token } from './nako3token.mjs'
import type { Ast } from './nako3/nako_ast.mjs'

export type MessageLevel = 'ERROR'|'WARN'|'INFO'|'HINT'

export interface ErrorInfoSubset {
    level: MessageLevel
    messageId: string
    args: MessageArgs
}

export interface ErrorInfoID {
    type: MessageLevel
    messageId: string
    args: MessageArgs
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export interface ErrorInfoRaw {
    type: MessageLevel
    message: string
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

type ErrorInfo = ErrorInfoID | ErrorInfoRaw

export class ErrorInfoManager {
    private problemsLimit: number
    private errorInfos: ErrorInfo[]

    constructor () {
        this.errorInfos = []
        this.problemsLimit = 100
    }

    setProblemsLimit (limit: number):void {
        this.problemsLimit = limit
    }
    clear ():void {
        this.errorInfos = []
    }

    get count(): number {
        return this.errorInfos.length
    }

    add (type: MessageLevel, messageId: string, args: MessageArgs, startLine: number, startCol: number, endLine: number, endCol: number) {
        if (this.errorInfos.length < this.problemsLimit) {
            this.errorInfos.push({
                type: type,
                messageId: messageId,
                args: args,
                startLine: startLine,
                startCol: startCol,
                endLine: endLine,
                endCol: endCol
            })
        }
    }

    addFromToken (type: MessageLevel, messageId: string, args: MessageArgs, tokenS: Token|SourceMap|Ast, tokenE?: Token|SourceMap|Ast) {
        tokenE = tokenE || tokenS
        this.add (type, messageId, args, tokenS.startLine, tokenS.startCol, tokenE.endLine, tokenE.endCol)
    }

    addRaw (type: MessageLevel, message: string, startLine: number, startCol: number, endLine: number, endCol: number) {
        if (this.errorInfos.length < this.problemsLimit) {
            this.errorInfos.push({
                type: type,
                message: message,
                startLine: startLine,
                startCol: startCol,
                endLine: endLine,
                endCol: endCol
            })
        }
    }

    addRawFromToken (type: MessageLevel, message: string, tokenS: Token|SourceMap|Ast, tokenE?: Token|SourceMap|Ast) {
        tokenE = tokenE || tokenS
        this.addRaw (type, message, tokenS.startLine, tokenS.startCol, tokenE.endLine, tokenE.endCol)
    }

    getAll (): ErrorInfo[] {
        return this.errorInfos
    }
}