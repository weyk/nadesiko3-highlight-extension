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
    TextDocument,
    Uri
} from 'vscode'
import { EventEmitter } from 'node:events'
import { nako3extensionOption } from './nako3option.mjs'
import { Token } from './nako3token.mjs'
import { COL_START } from './nako3lexer.mjs'
import { trimOkurigana } from './nako3util.mjs'
import { Nako3Document, SymbolInfo } from './nako3document.mjs'
import { ErrorInfoManager, ErrorInfoID, ErrorInfoRaw } from './nako3errorinfo.mjs'
import { getMessageWithArgs } from './nako3message.mjs'
import { ModuleLink } from './nako3module.mjs'
import { argsToString } from './nako3util.mjs'
import { logger } from './logger.mjs'
import { operatorCommand } from './nako3command.mjs'
import type { RuntimeEnv, DeclareFunction } from './nako3types.mjs'

export const tokenTypes = ['function', 'variable', 'comment', 'string', 'number', 'keyword', 'operator', 'type', 'parameter', 'decorator']
export const tokenModifiers = ['declaration', 'documentation', 'defaultLibrary', 'deprecated', 'readonly']

type HighlightMap = {[k:string]: string | [string, string |string[]]}
const hilightMapping: HighlightMap = {
    bigint: 'number',
    number: 'number',
    COMMENT_LINE: 'comment',
    COMMENT_BLOCK: 'comment',
    STRING_EX: 'string',
    string: 'string',
    FUNCTION_DECLARE: 'keyword',
    FUNCTION_ATTRIBUTE: 'decorator',
    FUNCTION_ATTR_SEPARATOR: 'decorator',
    FUNCTION_ATTR_PARENTIS: 'decorator',
    FUNCTION_ARG_PARAMETER: 'parameter',
    FUNCTION_ARG_SEPARATOR: 'keyword',
    FUNCTION_ARG_PARENTIS: 'keyword',
    FUNCTION_NAME: ['function', 'declaration'],
    STRING_INJECT_START: 'keyword',
    STRING_INJECT_END: 'keyword',
    sys_const: ['variable', ['defaultLibrary', 'readonly']],
    sys_func: ['function', ['defaultLibrary']],
    sys_var: ['variable', ['defaultLibrary']],
    user_func: 'function',
    user_const: ['variable', ['readonly']],
    user_var: 'variable',
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
    エラーならば: 'keyword',
    インデント構文: 'keyword',
    DNCLモード: 'keyword',
    DNCL2モード: 'keyword',
    モード設定: 'keyword',
    取込: 'keyword',
    モジュール公開既定値: 'keyword',
    逐次実行: ['keyword', ['deprecated']],
    厳チェック: 'keyword',
    shift_r0: 'operator',
    shift_r: 'operator',
    shift_l: 'operator',
    gteq: 'operator',
    lteq: 'operator',
    noteq: 'operator',
    eq: 'operator',
    gt: 'operator',
    lt: 'operator',
    not: 'operator',
    and: 'operator',
    or: 'operator',
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
    '===': 'operator',
    '!==': 'operator',
    ':': 'operator',
    'def_func': 'keyword',
    '_eol': 'keyword',
    '!': 'keyword'
}

export const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

export class Nako3DocumentExt extends EventEmitter {
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
    runtimeEnvDefault: RuntimeEnv
    useShebang: boolean
    link: ModuleLink
    isTextDocument: boolean
    isDirty: boolean

    constructor (target: TextDocument|Uri) {
        super()
        if (target instanceof Uri) {
            this.uri = target
            this.isTextDocument = false
            
        } else {
            this.uri = target.uri
            this.isTextDocument = true            
        }
        this.link = new ModuleLink(this.uri, this.uri)
        this.nako3doc = new Nako3Document(this.uri.fsPath, this.link)
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
        this.runtimeEnvDefault = 'wnako'
        this.useShebang = true
        this.isDirty = false
    }

    rename (newFilename: string):void {
        this.nako3doc.filename = newFilename
    }

    invalidate ():void {
        this.validSemanticTokens = false
        this.validDocumentSymbols = false
        this.validDiagnostics = false
    }

    clearError ():void {
        if (!this.isErrorClear) {
            this.errorInfos.clear()
            this.isErrorClear = true
        }
    }

    updateText (text: string, textVersion: number|null):void {
        if (textVersion === null || textVersion !== this.textVersion) {
            this.textVersion = textVersion
            if (this.text !== text) {
                console.log(`docext:text update.`)
                this.text = text
                this.validTokens = false
                this.invalidate()
            }
        }
    }

    setProblemsLimit (limit: number) {
        this.problemsLimit = limit
    }

    setRuntimeEnvDefault (runtime: RuntimeEnv) {
        this.runtimeEnvDefault = runtime
        this.nako3doc.runtimeEnvDefault = runtime
        this.nako3doc.lex.runtimeEnvDefault = runtime
    }
    
    setUseShebang (useShebang: boolean) {
        this.useShebang = useShebang
        this.nako3doc.useShebang = useShebang
        this.nako3doc.lex.useShebang = useShebang
    }

    tokenize (): void {
        if (!this.validTokens) {
            this.clearError()
            this.nako3doc.clearError()
            this.isErrorClear = false
            this.nako3doc.tokenize(this.text)
            this.validTokens = true
            logger.info('process tokenize')
        } else {
            logger.info('skip tokenize')
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

    private getRangeFromTokenContent (token: Token, col: number): Range|null {
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
        return range
    }
    getHover (position: Position): Hover|null {
        this.tokenize()
        const line = position.line
        const col = position.character
        const token = this.nako3doc.getTokenByPosition(line, col)
        
        if (token !== null) {
            if (['sys_func','sys_var','sys_const'].includes(token.type)) {
                const commandInfo = this.nako3doc.lex.getCommandInfo(token.value)
                if (!commandInfo) {
                    return null
                }
                let range = this.getRangeFromTokenContent(token, col)
                if (range === null) {
                    return null
                }
                let cmd:string
                if (token.type === 'sys_var') {
                    cmd = `変数 ${commandInfo.name}`
                } else if (token.type === 'sys_const') {
                    cmd = `定数 ${commandInfo.name}`
                } else {
                    const declfunc = commandInfo as DeclareFunction
                    if (declfunc.args && declfunc.args.length > 0) {
                        cmd = `命令 (${argsToString(declfunc.args)})${commandInfo.name}`
                    } else {
                        cmd = `命令 ${commandInfo.name}`
                    }
                }
                return new Hover([cmd, commandInfo.hint || ''], range)
            } else if (nako3extensionOption.useOperatorHint && token.group === '演算子') {
                let range = this.getRangeFromTokenContent(token, col)
                if (range === null) {
                    return null
                }
                const opeInfo = operatorCommand.get(token.type)
                if (!opeInfo) {
                    return null
                }
                let cmd: string = '演算子 「' + opeInfo.cmd.join('」「') + '」'
                let hint: string = opeInfo.hint
                return new Hover([cmd, hint || ''], range)
            }
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

    private addDiagnosticsFromErrorInfos (errorInfos: ErrorInfoManager) {
        logger.log(`docext:addDiagnostics:start`)
        for (const errorInfo of errorInfos.getAll()) {
            logger.log(`docext:addDiagnostics:error message`)
            const startPos = new Position(errorInfo.startLine, errorInfo.startCol)
            const endPos = new Position(errorInfo.endLine, errorInfo.endCol)
            const range = new Range(startPos, endPos)
            let message:string
            console.log(errorInfo)
            if (errorInfo.hasOwnProperty('messageId')) {
                logger.log(`docext:addDiagnostics:get message by ID`)
                message = getMessageWithArgs((errorInfo as ErrorInfoID).messageId, (errorInfo as ErrorInfoID).args)
            } else {
                logger.log(`docext:addDiagnostics:get message by argumenttID`)
                message = (errorInfo as ErrorInfoRaw).message
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
            logger.log(`docext:addDiagnostics:push array`)
            logger.log(`docext:addDiagnostics:${kind.toString()}:${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}:${message}`)
            this.diagnostics.push(new Diagnostic(range, message, kind))
        }
    }

    private computeDiagnostics () {
        this.tokenize()
        this.diagnostics = []
        let problemsRemain = this.problemsLimit

        this.nako3doc.lex.setProblemsLimit(problemsRemain)
        logger.debug(`docext:get problems from lexer ${this.nako3doc.lex.errorInfos.count}/${problemsRemain}`)
        this.addDiagnosticsFromErrorInfos(this.nako3doc.lex.errorInfos)
        problemsRemain -= this.nako3doc.lex.errorInfos.count

        this.nako3doc.parser.setProblemsLimit(problemsRemain)
        logger.debug(`docext:get problems from parser ${this.nako3doc.parser.errorInfos.count}/${problemsRemain}`)
        this.addDiagnosticsFromErrorInfos(this.nako3doc.parser.errorInfos)
        problemsRemain -= this.nako3doc.parser.errorInfos.count

        this.nako3doc.setProblemsLimit(problemsRemain)
        logger.debug(`docext:get problems from doc ${this.nako3doc.errorInfos.count}/${problemsRemain}`)
        this.addDiagnosticsFromErrorInfos(this.nako3doc.errorInfos)
        problemsRemain -= this.nako3doc.errorInfos.count

        this.setProblemsLimit(problemsRemain)
        logger.debug(`docext:get problems from docext ${this.errorInfos.count}/${problemsRemain}`)
        this.addDiagnosticsFromErrorInfos(this.errorInfos)

        this.validDiagnostics = true
    }

    private createDocumentSymbolFromToken (name: string|null, type: string, token:Token): DocumentSymbol {
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

    private computeDocumentSymbols():void {
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
            const nameNormalized = nameTrimed ? trimOkurigana(nameTrimed) : null
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

    private computeSemanticToken():void {
        this.tokenize()
        const logicTokens = this.nako3doc.lex.tokens
        const commentTokens = this.nako3doc.lex.commentTokens
        const tokensBuilder = new SemanticTokensBuilder()
        let logicIndex = 0
        let commentIndex = 0
        while (logicIndex < logicTokens.length || commentIndex < commentTokens.length) {
            let token: Token
            if (commentIndex === commentTokens.length ||
                (logicTokens[logicIndex].startLine < commentTokens[commentIndex].startLine) ||
                (logicTokens[logicIndex].startLine === commentTokens[commentIndex].startLine && logicTokens[logicIndex].startCol < commentTokens[commentIndex].startCol)) {
                token = logicTokens[logicIndex]
                logicIndex++
            } else {
                token = commentTokens[commentIndex]
                commentIndex++
            }
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
                if (token.type === 'word' || tokenType === 'string' || tokenType === 'number' || tokenType === 'function' || tokenType === 'variable') {
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
}
