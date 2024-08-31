import {
    l10n,
    Diagnostic,
    DiagnosticSeverity,
    DocumentHighlight,
    DocumentHighlightKind,
    DocumentSymbol,
    Hover,
    Position,
    Range,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    SymbolKind,
    Uri
} from 'vscode'
import { Nako3Token, COL_START } from './nako3lexer.mjs'
import { Nako3Document, SymbolInfo } from './nako3document.mjs'
import { ErrorInfoManager, messages } from './nako3errorinfo.mjs'
import { logger } from './logger.mjs'

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
    STRING_INJECT_START: 'keyword',
    STRING_INJECT_END: 'keyword',
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
    documentSymbols: DocumentSymbol[]
    diagnostics: Diagnostic[]
    validSemanticTokens: boolean
    validDocumentSymbols: boolean
    validDiagnostics: boolean
    uri: Uri
    text: string
    textVersion: number|null
    isErrorClear: boolean
    errorInfos: ErrorInfoManager
    problemsLimit: number
    runtimeEnv: string

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
        this.errorInfos = new ErrorInfoManager()
        this.isErrorClear = true
        this.problemsLimit = 100
        this.runtimeEnv = 'wnako'
    }

    invalidate ():void {
        this.validSemanticTokens = false
        this.validDocumentSymbols = false
        this.validDiagnostics = false
    }

    setRuntimeEnv (runtime: string) {
        this.runtimeEnv = runtime
        this.nako3doc.runtimeEnv = runtime
        this.nako3doc.lex.runtimeEnv = runtime
    }
    
    addDiagnosticsFromErrorInfos (errorInfos: ErrorInfoManager) {
        for (const errorInfo of errorInfos.getAll()) {
            const messageId = errorInfo.messageId
            const startPos = new Position(errorInfo.startLine, errorInfo.startCol)
            const endPos = new Position(errorInfo.endLine, errorInfo.endCol)
            const range = new Range(startPos, endPos)
            let message = l10n.t(messageId)
            if (message === messageId) {
                message = l10n.t(messages.get(messageId)!, errorInfo.args)
            } else {
                message = l10n.t(messageId, errorInfo.args)
            }
            let kind:DiagnosticSeverity
            switch (errorInfo.type) {
            case 'ERROR':
                kind = DiagnosticSeverity.Error
                break
            case 'WARN':
                kind = DiagnosticSeverity.Warning
                break
            case 'INFO':
                kind = DiagnosticSeverity.Information
                break
            case 'HINT':
                kind = DiagnosticSeverity.Hint
                break
            default:
                kind = DiagnosticSeverity.Information
            }
            this.diagnostics.push(new Diagnostic(range, message, kind))
        }
    }

    computeDiagnostics () {
        this.tokenize()
        this.diagnostics = []
        let problemsRemain = this.problemsLimit

        this.nako3doc.lex.setProblemsLimit(problemsRemain)
        this.addDiagnosticsFromErrorInfos(this.nako3doc.lex.errorInfos)
        problemsRemain -= this.nako3doc.lex.errorInfos.count

        this.nako3doc.setProblemsLimit(problemsRemain)
        this.addDiagnosticsFromErrorInfos(this.nako3doc.errorInfos)
        problemsRemain -= this.nako3doc.errorInfos.count

        this.setProblemsLimit(problemsRemain)
        this.addDiagnosticsFromErrorInfos(this.errorInfos)

        this.validDiagnostics = true
    }

    createDocumentSymbolFromToken (name: string|null, type: string, token:Nako3Token): DocumentSymbol {
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
        if (!name) {
            name = '<anonymous function>'
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
        
        const symbols: SymbolInfo[] = this.nako3doc.getDeclareSymbols()
        let isToplevel = false
        let nestLevel = 0
        let containerSymbol: DocumentSymbol|null = null
        const symbolStack: {level:number,symbol:DocumentSymbol|null}[] = []
        let symbolLast:DocumentSymbol|null = null 
        for (const symbolinfo of symbols) {
            const nameTrimed = symbolinfo.name?.trim()
            const nameNormalized = nameTrimed ? this.nako3doc.lex.trimOkurigana(nameTrimed) : null
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
            if (symbolinfo.level > nestLevel) {
                symbolStack.push({level:nestLevel, symbol:containerSymbol})
                containerSymbol = symbolLast
                nestLevel = symbolinfo.level
            }
            if (symbolinfo.level < nestLevel) {
                while (symbolStack.length > 0 && symbolinfo.level < nestLevel) {
                    const symbolPrev = symbolStack.pop()
                    if (symbolPrev) {
                        nestLevel = symbolPrev.level
                        containerSymbol = symbolPrev.symbol
                    }
                }
            }
            if (containerSymbol) {
                containerSymbol.children.push(symbol)
            } else {
                this.documentSymbols.push(symbol)
            }
            symbolLast = symbol
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
            this.clearError()
            this.nako3doc.clearError()
            this.nako3doc.tokenize(this.text)
            this.validTokens = true
            this.isErrorClear = false
            logger.info('process tokenize')
        } else {
            logger.info('skip tokenize')
        }
    }

    setProblemsLimit (limit: number) {
        this.problemsLimit = limit
    }

    clearError ():void {
        if (!this.isErrorClear) {
            this.errorInfos.clear()
            this.isErrorClear = true
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
            logger.info('process computeSemanticToken')
        } else {
            logger.info('skip computeSemanticToken')
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

    getHover (position: Position): Hover|null {
        this.tokenize()
        const line = position.line
        const col = position.character
        const token = this.nako3doc.getTokenByPosition(line, col)
        if (token !== null && ['システム関数','システム変数','システム定数'].includes(token.type)) {
            const commandInfo = this.nako3doc.lex.getCommandInfo(token.value)
            if (!commandInfo) {
                return null
            }
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
            let cmd:string
            if (['システム変数','システム定数'].includes(token.type)) {
                cmd = `${token.type.slice(-2)} ${commandInfo.command}`
            } else {
                if (commandInfo.args.length > 0) {
                    cmd = `命令 (${commandInfo.args})${commandInfo.command}`
                } else {
                    cmd = `命令 ${commandInfo.command}`
                }
            }
            return new Hover([cmd, commandInfo.hint], range)
        }
        return null
    }

    getDocumentSymbols (): DocumentSymbol[] {
        if (!this.validDocumentSymbols) {
            this.computeDocumentSymbols()
            logger.log('process computeDocumentSymbols')
        } else {
            logger.log('skip computeDocumentSymbols')
        }
        return this.documentSymbols
    }

    getDiagnostics (): Diagnostic[] {
        if (!this.validDiagnostics) {
            this.computeDiagnostics()
            logger.log('process computeDiagnostics')
        } else {
            logger.log('skip computeDiagnostics')
        }
        return this.diagnostics
    }
}
