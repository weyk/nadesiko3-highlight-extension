import { Nako3Tokenizer, Nako3Token } from './nako3lexer.mjs'

export class Nako3Document {
    lex: Nako3Tokenizer
    filename: string

    constructor (filename: string) {
        this.lex = new Nako3Tokenizer(filename)
        this.filename = filename
    }

    tokenize (text: string):void {
        this.lex.tokenize(text)
        this.lex.fixTokens()
        this.lex.applyFunction()
    }

     getTokenByPosition(line: number, col: number): Nako3Token|null {
        const index = this.getTokenIndexByPosition(line, col)
        if (index === null) {
            return null
        }
        return this.lex.tokens[index]
    }

    getTokenIndexByPosition(line: number, col: number): number|null {
        const consoleLogToken = (msg:string, token:Nako3Token|null):void => {
            if (token === null) {
                return
            }
            console.log(`${msg} token(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
        }
        let tokens = this.lex.tokens
        let il = 0
        let ih = tokens.length
        // console.log(`find token:position(${line}:${col})`)
        while (il < ih) {
            let i = Math.floor((ih - il) / 2) + il
            let token = tokens[i]
            // console.log(`check(${il}-${ih}) ${i}`)
            if (token.endLine < line || (token.endLine === line && token.endCol <= col)) {
                // ilとihの中間iよりも大きい。
                if (il < i) {
                    il = i
                } else {
                    il++
                }
            } else if (token.startLine > line || (token.startLine === line && token.startCol > col)) {
                // ilとihの中間iよりも小さい。
                if (ih > i) {
                    ih = i
                } else {
                    ih--
                }
            } else {
                // consoleLogToken('found token', token)
                return i
            }
        }
        // console.log('not found token')
        return null
    }
}
