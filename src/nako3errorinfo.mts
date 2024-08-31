import { error } from 'console'
import { Nako3Token } from './nako3lexer.mjs'

export type MessageArgs = Record<string, string|number>
export type MessageLevel = 'ERROR'|'WARN'|'INFO'|'HINT'

export const messages = new Map<string,string>([
    ['noFuncParamParentisR', 'not found right parentis in function parameters({type})'],
    ['unknownTokenInFuncParam', 'unknown token in function parameters({type})'],
    ['invalidChar', 'invalid character(code:{code})'],
    ['unclosedBlockComment', 'unclose block comment'],
    ['stringInStringStartChar', 'string start character in same string({startTag})'],
    ['unclosedPlaceHolder', 'unclose wave parentis in template string'],
    ['unclosedString', 'unclose string'],
    // in nako3document
    ['mustThenFollowIf', 'moshi must follow naraba same line'],
    ['kokomadeUseInIndentMode', 'cannot use kokomade in indent semantic mode'],
    ['invalidTokenKokomade', 'invalid token kokomade:{nestLevel}:{statement}'],
    ['invalidTokenNaraba', 'invalid token naraba:{nestLevel}:{statement}'],
    ['invalidTokenChigaeba', 'invalid token chgaeba:{nestLevel}:{statement}'],
    ['invalidTokenErrorNaraba', 'invalid token error-naraba:{nestLevel}:{statement}'],
    ['declareFuncMustGlobal', 'declare function must global scopse'],
    ['syntaxError', 'syntax error'],
    ['noCloseStatement', 'no closed statement({type})']
])

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

    addFromToken (type: MessageLevel, messageId: string, args: MessageArgs, token: Nako3Token) {
        this.add (type, messageId, args, token.startLine, token.startCol, token.endLine, token.endCol)
    }

    getAll (): ErrorInfo[] {
        return this.errorInfos
    }
}