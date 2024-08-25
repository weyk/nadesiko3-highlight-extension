import {
    languages,
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    DocumentHighlight,
    DocumentHighlightKind,
    DocumentSymbol,
    Position,
    Range,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    SymbolKind,
    TextDocument,
    Uri
} from 'vscode'
import { Nako3Token, COL_START } from './nako3lexer.mjs'
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

interface SymbolInfo {
    name: string
    type: string
    token: Nako3Token
    level: number
}

export class Nako3DocumentExt {
    nako3doc: Nako3Document
    validTokens: boolean
    semanticTokens?: SemanticTokens
    documentSymbols: DocumentSymbol[]
    diagnostics: Diagnostic[]
    validSemanticTokens: boolean
    validDocumentSymbols: boolean
    validDiagnostics: boolean
    uri: Uri
    text: string
    textVersion: number|null
    isIndentSemantic: boolean

    constructor (filename: string, uri: Uri) {
        this.nako3doc = new Nako3Document(filename)
        this.uri = uri
        this.text = ''
        this.textVersion = null
        this.validTokens = false
        this.semanticTokens = undefined
        this.validSemanticTokens = false
        this.documentSymbols = []
        this.validDocumentSymbols = false
        this.diagnostics = []
        this.validDiagnostics = false
        this.isIndentSemantic = false
    }

    invalidate ():void {
        this.validSemanticTokens = false
        this.validDocumentSymbols = false
        this.validDiagnostics = false
    }

    computeDiagnostics () {
        this.tokenize()
        this.diagnostics = []
        for (const errorInfo of this.nako3doc.lex.errorInfos) {
            const startPos = new Position(errorInfo.startLine, errorInfo.startCol)
            const endPos = new Position(errorInfo.endLine, errorInfo.endCol)
            const range = new Range(startPos, endPos)
            let kind:DiagnosticSeverity
            switch (errorInfo.type) {
            case 'ERROR':
                kind = DiagnosticSeverity.Error
                break
            case 'WARN':
                kind = DiagnosticSeverity.Warning
                break
            default:
                kind = DiagnosticSeverity.Information
            }
            this.diagnostics.push(new Diagnostic(range, errorInfo.message, kind))
        }
        this.validDiagnostics = true
    }

    createDocumentSymbolFromToken (name: string, type: string, token:Nako3Token): DocumentSymbol {
        let kind:SymbolKind
        switch (type) {
        case 'function':
            kind = SymbolKind.Function
            break
        case 'variable':
            kind = SymbolKind.Variable
            break
        case 'constant':
            kind = SymbolKind.Constant
            break
        default:
            console.log(`createDocumentSymbolFromToken: UnknownType${type}`)
            kind = SymbolKind.Null
        }
        const start = new Position(token.startLine, token.startCol)
        const end = new Position(token.endLine, token.resEndCol)
        const range = new Range(start, end)
        const symbol = new DocumentSymbol(name, '', kind, range, range)
        return symbol
    }

    computeDocumentSymbols():void {
        this.tokenize()
        this.documentSymbols = []
        this.isIndentSemantic = false
        const tokens = this.nako3doc.lex.tokens
        const tokenCount = tokens.length
        let skipToken = 0
        let currentLine = -1
        let startCol = -1
        let kokomadeIndex = -1
        let kokomadeSymbolIndex = -1
        let functionSymbolIndexPrev = -1
        const symbols: SymbolInfo[] = []
        for (let index = 0; index < tokenCount; index++) {
            const token = tokens[index]
            if (currentLine !== token.startLine ) {
                startCol = token.startCol
                currentLine = token.startLine
            }
            if (skipToken > 0) {
                skipToken--
                continue
            }
            if (false && ((token.type === '定数' || token.type === '変数') || (token.type === 'WORD' && (token.value === '定数' || token.value === '変数')))) {
                console.log(`const/var semantic?:${index}`)
                if (index > 0) {
                    console.log(`  prev token:${tokens[index-1].type}/${tokens[index-1].value}`)
                }
                console.log(`  curr token:${tokens[index+0].type}/${tokens[index+0].value}`)
                if (index < tokenCount) {
                    console.log(`  next token:${tokens[index+1].type}/${tokens[index+1].value}`)
                }
            }
            if (token.type === 'ここまで') {
                kokomadeIndex = index
                kokomadeSymbolIndex = symbols.length - 1
            } else
            if (index+1 < tokenCount && token.type === 'NOT' && (token.value === '!' || token.value === '！') && tokens[index+1].type === 'インデント構文') {
                console.log('indent semantic on')
                this.isIndentSemantic = true
                skipToken = 1
            } else if (token.type === 'FUNCTION_NAME') {
                if (!this.isIndentSemantic) {
                    for (let i = functionSymbolIndexPrev + 1; i < kokomadeSymbolIndex + 1; i++) {
                        symbols[i].level = 1
                    }
                }
                const symbolInfo: SymbolInfo = {
                    name: token.value,
                    type: '関数',
                    level: 0,
                    token: token
                }
                symbols.push(symbolInfo)
                functionSymbolIndexPrev = symbols.length -1
            } else if (index+2 < tokenCount && token.type === 'WORD' && tokens[index+1].type === 'とは' && (tokens[index+2].type === '変数' || tokens[index+2].type === '定数')) {
                const symbolInfo: SymbolInfo = {
                    name: token.value,
                    type: tokens[index + 2].type,
                    level: this.isIndentSemantic && startCol > COL_START ? 1 : 0,
                    token: token
                }
                symbols.push(symbolInfo)
                skipToken = 2
            } else if (index+1 < tokenCount && (token.type === '変数' || token.type === '定数') && (tokens[index+1].type === '変数' || tokens[index+1].type === 'WORD')) {
                const symbolInfo: SymbolInfo = {
                    name: tokens[index + 1].value,
                    type: token.type,
                    level: this.isIndentSemantic && startCol > COL_START ? 1 : 0,
                    token: tokens[index + 1]
                }
                symbols.push(symbolInfo)
                skipToken = 1
            }
            if (currentLine !== token.endLine) {
                startCol = -1
                currentLine = token.endLine
            }
        }
        let isToplevel = false
        let nestLevel = 0
        let containerSymbol: DocumentSymbol|null = null
        for (const symbolinfo of symbols) {
            const nameTrimed = symbolinfo.name.trim()
            const nameNormalized = this.nako3doc.lex.trimOkurigana(nameTrimed)
            let type:string
            switch (symbolinfo.type) {
            case '定数':
                type = 'constant'
                break
            case '変数':
                type = 'variable'
                break
            case '関数':
                type = 'function'
                break
            default:
                type = ''
            }
            const symbol = this.createDocumentSymbolFromToken(nameNormalized, type, symbolinfo.token)
            if (symbolinfo.level === 0) {
                isToplevel = true
                this.documentSymbols.push(symbol)
                containerSymbol = symbol
            } else if (containerSymbol !== null) {
                containerSymbol.children.push(symbol)
            }
        }
        this.validDocumentSymbols = true
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
            this.invalidate()
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

    getDocumentSymbols (): DocumentSymbol[] {
        if (!this.validDocumentSymbols) {
            this.computeDocumentSymbols()
        } else {
            console.log('skip computeDocumentSymbols')
        }
        return this.documentSymbols
    }

    getDiagnostics (): Diagnostic[] {
        if (!this.validDiagnostics) {
            this.computeDiagnostics()
        } else {
            console.log('skip computeDiagnostics')
        }
        return this.diagnostics
    }
}

export class Nako3Documents implements Disposable {
    docs: Map<string, Nako3DocumentExt>
    diagnosticsCollection: DiagnosticCollection

    constructor () {
        // console.log('nako3documnets constructed')
        this.docs = new Map()
        this.diagnosticsCollection = languages.createDiagnosticCollection("nadesiko3")
    }

    [Symbol.dispose](): void {
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose()
        }
    }

    open (document: TextDocument):void {
        // console.log('document open:enter')
        this.docs.set(document.fileName, new Nako3DocumentExt(document.fileName, document.uri))
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

    getSymbols (document: TextDocument): DocumentSymbol[] {
        const doc = this.get(document)
        if (doc == null) {
            console.log(`getSymbols: document not opend`)
            return []
        }
        return doc.getDocumentSymbols()
    }

    getDiagnostics (document?: TextDocument): DiagnosticCollection {
        this.diagnosticsCollection.clear()
        if (document) {
            const doc = this.get(document)
            if (doc == null) {
                console.log(`getDiagnostics: document not opend`)
            }
        }
        for (const [ , doc] of this.docs) {
            this.diagnosticsCollection.set(doc.uri, doc.getDiagnostics())
        }
        return this.diagnosticsCollection
    }
}
