import { Token } from './nako3token.mjs'
import { SourceMap } from './nako3types.mjs'
import { Ast } from './nako3/nako_ast.mjs'
import { MessageArgs } from './nako3message.mjs'

export type MessageLevel = 'ERROR'|'WARN'|'INFO'|'HINT'

interface ErrorInfo {
    type: MessageLevel
    messageId: string
    args: MessageArgs
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export class ErrorInfoManager {
    problemsLimit: number
    errorInfos: ErrorInfo[]

    constructor () {
        this.errorInfos = []
        this.problemsLimit = 100
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

    addFromToken (type: MessageLevel, messageId: string, args: MessageArgs, token: Token|SourceMap|Ast) {
        this.add (type, messageId, args, token.startLine, token.startCol, token.endLine, token.endCol)
    }

    getAll (): ErrorInfo[] {
        return this.errorInfos
    }
}