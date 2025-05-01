import type { Token } from './nako3/nako3token.mjs'

export class Nako3Range {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    resEndCol: number

    constructor (startLine: number, startCol: number, endLine: number, endCol: number, resEndCol: number) {
        this.startLine = startLine
        this.startCol = startCol
        this.endLine = endLine
        this.endCol = endCol
        this.resEndCol = resEndCol
    }

    static fromToken (token: Token): Nako3Range {
        const range = new Nako3Range(token.startLine, token.startCol, token.endLine, token.endCol, token.resEndCol)
        return range
    }

    equals (target: Nako3Range): boolean {
        if (this.startLine !== target.startLine) { return false }
        if (this.startCol !== target.startCol) { return false }
        if (this.endLine !== target.endLine) { return false }
        if (this.endCol !== target.endCol) { return false }
        if (this.resEndCol !== target.resEndCol) { return false }
        return true
    }
}
  