import {
    DocumentHighlight,
    DocumentHighlightKind,
    Position,
    Range,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    TextDocument
} from 'vscode'
import { COL_START } from './nako3lexer.mjs'
import { Nako3Document } from './nako3document.mjs'

export const tokenTypes = ['function', 'variable', 'comment', 'string', 'number', 'keyword', 'operator', 'type', 'parameter', 'decorator']
export const tokenModifiers = ['declaration', 'documentation', 'defaultLibrary', 'deprecated', 'readonly']

type HighlightMap = {[k:string]: string | [string, string |string[]]}
const hilightMapping: HighlightMap = {
    NUMBER_EX: 'number',
    NUMBER: 'number',
    COMMENT_LINE: 'comment',
    COMMENT_BLOCK: 'comment',
    STRING_EX: 'string',
    STRING: 'string',
    FUNCTION_DECLARE: 'keyword',
    FUNCTION_ATTRIBUTE: 'decorator',
    FUNCTION_ARG_PARAMETER: 'parameter',
    FUNCTION_ARG_SEPARATOR: 'keyword',
    FUNCTION_ARG_PARENTIS: 'keyword',
    FUNCTION_NAME: ['function', 'declaration'],
    システム定数: ['variable', ['defaultLibrary', 'readonly']],
    システム関数: ['function', ['defaultLibrary']],
    システム変数: ['variable', ['defaultLibrary']],
    ユーザー関数: 'function',
    ここから: 'keyword',
    ここまで: 'keyword',
    もし: 'keyword',
    ならば: 'keyword',
    違えば: 'keyword',
    とは: 'keyword',
    には: 'keyword',
    回: 'keyword',
    間: 'keyword',
    繰返: 'keyword',
    増繰返: 'keyword',
    減繰返: 'keyword',
    後判定: 'keyword',
    反復: 'keyword',
    抜ける: 'keyword',
    続ける: 'keyword',
    戻る: 'keyword',
    先に: 'keyword',
    次に: 'keyword',
    実行速度優先: 'keyword',
    パフォーマンスモニタ適用: 'keyword',
    定める: 'keyword',
    条件分岐: 'keyword',
    増: 'keyword',
    減: 'keyword',
    変数: 'type',
    定数: 'type',
    エラー監視: 'keyword',
    エラー: 'keyword',
    インデント構文: 'keyword',
    DNCLモード: 'keyword',
    モード設定: 'keyword',
    取込: 'keyword',
    モジュール公開既定値: 'keyword',
    逐次実行: ['keyword', ['deprecated']],
    SHIFT_R0: 'operator',
    SHIFT_R: 'operator',
    SHIFT_L: 'operator',
    GE: 'operator',
    LE: 'operator',
    NE: 'operator',
    EQ: 'operator',
    GT: 'operator',
    LT: 'operator',
    NOT: 'operator',
    AND: 'operator',
    OR: 'operator',
    '+': 'operator',
    '-': 'operator',
    '**': 'operator',
    '*': 'operator',
    '@': 'operator',
    '÷÷': 'operator',
    '÷': 'operator',
    '%': 'operator',
    '^': 'operator',
    '&': 'operator',
    ':': 'operator',
    'def_func': 'keyword',
}

export const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

export class Nako3DocumentExt {
    nako3doc: Nako3Document
    validTokens: boolean
    semanticTokens?: SemanticTokens
    validSemanticTokens: boolean
    text: string
    textVersion: number|null

    constructor (filename: string) {
        this.nako3doc = new Nako3Document(filename)
        this.validTokens = false
        this.semanticTokens = undefined
        this.validSemanticTokens = false
        this.text = ''
        this.textVersion = null
    }

    computeSemanticToken():void {
        this.tokenize()
        const tokensBuilder = new SemanticTokensBuilder()
        for (const token of this.nako3doc.lex.tokens) {
            const highlightClass = hilightMapping[token.type]
            if (highlightClass) {
                let tokenType:string
                let tokenModifier:string[]
                if (typeof highlightClass === 'string') {
                    tokenType = highlightClass
                    tokenModifier = []
                } else {
                    tokenType = highlightClass[0]
                    if (typeof highlightClass[1] === 'string') {
                        tokenModifier = [highlightClass[1]]
                    } else {
                        tokenModifier = highlightClass[1]
                    }
                }
                // console.log(`${tokenType} range(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
                let endCol = token.endCol
                let len = token.len
                if (token.type === 'WORD' || tokenType === 'string' || tokenType === 'number' || tokenType === 'function' || tokenType === 'variable') {
                    endCol = token.resEndCol
                }
                // console.log(`${tokenType}[${tokenModifier}] range(${token.startLine}:${token.startCol}-${token.endLine}:${endCol})`)
                const tokenTypeIndex = tokenTypes.indexOf(tokenType)
                let ng = false
                if (tokenTypeIndex === -1) {
                    console.log(`type:${tokenType} no include lengend`)
                    ng = true
                }
                let tokenModifierBits = 0
                for (const modifier of tokenModifier) {
                    const tokenModifierIndex = tokenModifiers.indexOf(modifier)
                    if (tokenTypeIndex === -1) {
                        console.log(`modifier:${modifier} no include lengend`)
                        ng = true
                        continue
                    }
                    tokenModifierBits |= 1 << tokenModifierIndex
                }
                if (!ng) {
                    let col = token.startCol
                    for (let i = token.startLine;i <= token.endLine;i++) {
                        if (i === token.endLine) {
                            len = endCol - col
                        } else {
                            len = this.nako3doc.lex.lengthLines[i] - col
                        }
                        // console.log(`push ${i}:${col}-${len} ${tokenTypeIndex}[${tokenModifierBits}]`)
                        tokensBuilder.push(i, col, len, tokenTypeIndex, tokenModifierBits)
                        col = COL_START
                    }
                }
            }
        }
        this.semanticTokens = tokensBuilder.build()
        this.validSemanticTokens = true
    }

    rename (newFilename: string):void {
        this.nako3doc.filename = newFilename
    }

    tokenize (): void {
        if (!this.validTokens) {
            this.nako3doc.tokenize(this.text)
            this.validTokens = true
        } else {
            console.log('skip tokenize')
        }
    }

    updateText (text: string, textVersion: number|null):void {
        if (textVersion === null || textVersion !== this.textVersion) {
            this.text = text
            this.textVersion = textVersion
            this.validTokens = false
            this.validSemanticTokens = false
        }
    }

    getSemanticTokens (): SemanticTokens {
        if (!this.validSemanticTokens) {
            this.computeSemanticToken()
        } else {
            console.log('skip computeSemanticToken')
        }
        return this.semanticTokens!
    }
    
    getHighlight (position: Position): DocumentHighlight[] {
        this.tokenize()
        const line = position.line
        const col = position.character
        const token = this.nako3doc.getTokenByPosition(line, col)
        if (token !== null) {
            let range:Range
            if (token.josi !== '' && typeof token.josiStartCol === 'number') {
                if (col < token.josiStartCol) {
                    const startPos = new Position(token.startLine, token.startCol)
                    const endPos = new Position(token.endLine, token.josiStartCol)
                    range = new Range(startPos, endPos)
                } else {
                    const startPos = new Position(token.endLine, token.josiStartCol)
                    const endPos = new Position(token.endLine, token.endCol)
                    range = new Range(startPos, endPos)
                }
            } else {
                const startPos = new Position(token.startLine, token.startCol)
                const endPos = new Position(token.endLine, token.endCol)
                range = new Range(startPos, endPos)
            }
            return [new DocumentHighlight(range, DocumentHighlightKind.Text)]
        }
        return []
    }
}

export class Nako3Documents {
    docs: Map<string, Nako3DocumentExt>
    constructor () {
        // console.log('nako3documnets constructed')
        this.docs = new Map()
    }
    open (document: TextDocument):void {
        // console.log('document open:enter')
        this.docs.set(document.fileName, new Nako3DocumentExt(document.fileName))
        // console.log('document open:leave')
    }
    close (document: TextDocument):void {
        if (!this.docs.has(document.fileName)) {
            console.log(`document close: no open(${document.fileName})`)
        }
        this.docs.delete(document.fileName)
    }
    get (document: TextDocument): Nako3DocumentExt|undefined {
        return this.docs.get(document.fileName)
    }
    setFullText (document: TextDocument):void {
        const doc = this.get(document)
        if (doc) {
            doc.updateText(document.getText(), document.version)
        } else {
            console.log(`setFullText: document not opend`)
        }
    }
    getSemanticTokens(document: TextDocument): SemanticTokens {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getSemanticTokens: document not opend`)
            const builder = new SemanticTokensBuilder()
            return builder.build()
        }
        return doc.getSemanticTokens()
    }
    getHighlight (document: TextDocument, position: Position): DocumentHighlight[] {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getHighlight: document not opend`)
            return []
        }
        return doc.getHighlight(position)
    }
}
