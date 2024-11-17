import type { Token } from './nako3token.mjs'

export class Nako3Range {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    resEndCol: number

    constructor () {
        this.startLine = 0
        this.startCol = 0
        this.endLine = 0
        this.endCol = 0
        this.resEndCol = 0
    }

    static fromToken (token: Token): Nako3Range {
        const range = new Nako3Range()
        range.startLine = token.startLine
        range.startCol = token.startCol
        range.endLine = token.endLine
        range.endCol = token.endCol
        range.resEndCol = token.resEndCol
        return range
    }
}
  