import { Nako3Token } from './nako3lexer.mjs'

interface ErrorInfo {
    type: string
    message: string
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export class ErrorInfoManager {
    errorInfos: ErrorInfo[]
    constructor () {
        this.errorInfos = []
    }

    clear ():void {
        this.errorInfos = []
    }

    add (type: string, message: string, startLine: number, startCol: number, endLine: number, endCol: number) {
        this.errorInfos.push({
            type: type,
            message: message,
            startLine: startLine,
            startCol: startCol,
            endLine: endLine,
            endCol: endCol
        })
    }

    addFromToken (type: string, message: string, token: Nako3Token) {
        this.add (type, message, token.startLine, token.startCol, token.endLine, token.endCol)
    }

    getAll (): ErrorInfo[] {
        return this.errorInfos
    }
}