import { Nako3Tokenizer, Nako3Token, Indent, COL_START } from './nako3lexer.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { logger } from './logger.mjs'

export interface SymbolInfo {
    name: string|null
    type: string
    token: Nako3Token
    level: number
}

const kokomadePeirsStatements = [
    '回','間','繰返','増繰返','減繰返','後判定','反復','実行速度優先','パフォーマンスモニタ適用','条件分岐'
]

export class Nako3Document {
    lex: Nako3Tokenizer
    filename: string
    isErrorClear: boolean
    errorInfos: ErrorInfoManager
    isIndentSemantic: boolean
    isDefaultPrivate: boolean
    declareSymbols: SymbolInfo[]
    validDeclareSymbols: boolean
    runtimeEnv: string

    constructor (filename: string) {
        this.lex = new Nako3Tokenizer(filename)
        this.filename = filename
        this.errorInfos = new ErrorInfoManager()
        this.isErrorClear = true
        this.isIndentSemantic = false
        this.isDefaultPrivate = false
        this.declareSymbols = []
        this.validDeclareSymbols = false
        this.runtimeEnv = 'wnako'
    }

    invalidate ():void {
        this.validDeclareSymbols = false
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.problemsLimit = limit
    }

    tokenize (text: string):void {
        this.lex.tokenize(text)
        this.lex.fixTokens()
        this.lex.applyFunction()
        this.isErrorClear = false
        this.invalidate()
    }

    clearError ():void {
        if (!this.isErrorClear) {
            this.errorInfos.clear()
            this.isErrorClear = true
        }
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

    getDeclareSymbols(): SymbolInfo[] {
        if (!this.validDeclareSymbols) {
            this.computeDeclareSymbols()
            logger.info('process computeDeclareSymbols')
        } else {
            logger.info('skip computeDeclareSymbols')
        }
        return this.declareSymbols
    }
    
    computeDeclareSymbols():void {
        this.declareSymbols = []
        this.isIndentSemantic = false
        this.isDefaultPrivate = false
        const tokens = this.lex.tokens
        const tokenCount = tokens.length
        let indent: Indent
        let skipToken = 0
        let currentLine = -1
        let startCol = -1
        const indentLevelStack:{currentIndentLevel:number}[] = []
        let currentIndentLevel = 0
        let scopeNestLevel = 0
        const semanticNestStack:{type:string, tokenIndex:number}[] = []
        let semanticNestLevel = 0
        let currentNestStatement = 'グローバル'
        let currentNestTokenIndex = 0
        const symbols: SymbolInfo[] = []
        let wasKokomadeError = false
        let sameLineMode:string = ''
        let hasBody = false
        let canChigaeba = false
        for (let index = 0; index < tokenCount; index++) {
            const token = tokens[index]
            if (currentLine !== token.startLine ) {
                canChigaeba = false
                if (sameLineMode === 'もし') {
                    this.errorInfos.addFromToken('ERROR', 'mustThenFollowIf', {}, token)
                }
                if (sameLineMode === 'ならば' && hasBody) {
                    const statementPrev = semanticNestStack[semanticNestStack.length-1]
                    if (statementPrev?.type === '条件分岐') {
                        // console.log(`      jokenbunki-naraba has immediate body:(prev:${statementPrev?.type})`)
                        const nestStatement = semanticNestStack.pop()
                        if (nestStatement) {
                            currentNestStatement = nestStatement.type
                            currentNestTokenIndex = nestStatement.tokenIndex
                        } else {
                            // console.log('semanticNestLevel: over pop')
                        }
                        semanticNestLevel--
                        // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        // console.log(`      mosi-naraba has immediate body`)
                        canChigaeba = true
                        // console.log(`      can follow chigaeba next line`)
                    }
                } else if (sameLineMode === '違えば' && hasBody) {
                    // console.log(`      chigaeba has immediate body`)
                    const nestStatement = semanticNestStack.pop()
                    if (nestStatement) {
                        currentNestStatement = nestStatement.type
                        currentNestTokenIndex = nestStatement.tokenIndex
                    } else {
                        // console.log('semanticNestLevel: over pop')
                    }
                    semanticNestLevel--
                    // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                }
                startCol = token.startCol
                currentLine = token.startLine
                indent = token.indent
                sameLineMode = ''
                hasBody = false
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
            if (this.isIndentSemantic) {
                if (scopeNestLevel > 0 && currentIndentLevel <= token.indent.level) {
                    scopeNestLevel--
                    const indentInfo = indentLevelStack.pop()
                    if (indentInfo) {
                        currentIndentLevel = indentInfo.currentIndentLevel
                    } else {
                        currentIndentLevel = 0
                    }
                }
                if (token.type === 'ここまで') {
                    if (!wasKokomadeError) {
                        if (this.isIndentSemantic) {
                            this.errorInfos.addFromToken('ERROR', 'kokomadeUseInIndentMode', {}, token)
                            wasKokomadeError = true
                        }
                    }
                } 
            } else {
                if (!hasBody && !['COMMENT_LINE','COMMENT_BLOCK','EOL',','].includes(token.type)) {
                    if (sameLineMode === '違えば' && token.type === 'もし') {
                        // console.log('      special sequence:chigaeba-moshi')
                    } else {
                        hasBody = true
                        // console.log(`    has body:(${token.startLine},${token.startCol}):${token.type}:${token.value}`)
                    }
                    if (canChigaeba && token.type !== '違えば') {
                        canChigaeba = false
                        // console.log('      can follow chigaeba, but not it')
                        const nestStatement = semanticNestStack.pop()
                        if (nestStatement) {
                            currentNestStatement = nestStatement.type
                            currentNestTokenIndex = nestStatement.tokenIndex
                        } else {
                            // console.log('semanticNestLevel: over pop')
                        }
                        semanticNestLevel--
                        // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    }
                }
                if (kokomadePeirsStatements.includes(token.type)) {
                    semanticNestStack.push({type:currentNestStatement, tokenIndex:index})
                    currentNestStatement = token.type
                    semanticNestLevel++
                    // console.log(`  semantic nest:${semanticNestLevel}:${currentNestStatement}`)
                } else if (token.type === 'ここまで') {
                    if (kokomadePeirsStatements.includes(currentNestStatement)) {
                    } else if (currentNestStatement === '関数') {
                        scopeNestLevel--
                    } else if (currentNestStatement === 'エラーならば') {
                    } else if (currentNestStatement === 'ならば') {
                    } else if (currentNestStatement === '違えば') {
                    } else {
                        // console.log(`      kokomade cause invalid pair:${semanticNestLevel}:${currentNestStatement}`)
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenKokomade', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                    const nestStatement = semanticNestStack.pop()
                    if (nestStatement) {
                        currentNestStatement = nestStatement.type
                        currentNestTokenIndex = nestStatement.tokenIndex
                    } else [
                        // console.log('semanticNestLevel: over pop')
                    ]
                    semanticNestLevel--
                    // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    sameLineMode = ''
                    canChigaeba = false
                    hasBody = false
                } else if (token.type === 'もし') {
                    if (sameLineMode === '違えば' && !hasBody) {
                        currentNestStatement = 'もし'
                       //  console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        semanticNestStack.push({type:currentNestStatement, tokenIndex:currentNestTokenIndex})
                        semanticNestLevel++
                        currentNestStatement = 'もし'
                        currentNestTokenIndex = index
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    }
                    sameLineMode = 'もし'
                    hasBody = false
                } else if (token.type === '条件分岐') {
                    semanticNestStack.push({type:currentNestStatement, tokenIndex:currentNestTokenIndex})
                    semanticNestLevel++
                    currentNestStatement = '条件分岐'
                    currentNestTokenIndex = index
                    // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    hasBody = false
                } else if (token.type === 'ならば') {
                    if (!hasBody) {
                        // console.log(`      naraba before no body`)
                    }
                    if (currentNestStatement === 'もし') {
                        currentNestStatement = 'ならば'
                        sameLineMode = 'ならば'
                        hasBody = false
                        // console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else if (currentNestStatement === '条件分岐') {
                        semanticNestStack.push({type:currentNestStatement, tokenIndex:currentNestTokenIndex})
                        semanticNestLevel++
                        currentNestStatement = 'ならば'
                        sameLineMode = 'ならば'
                        hasBody = false
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenNaraba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (token.type === '違えば') {
                    if (currentNestStatement === 'ならば' || canChigaeba) {
                        if (canChigaeba) {
                            // console.log(`      can follow chigaeba, it now.`)
                            canChigaeba = false
                        }
                        currentNestStatement = '違えば'
                        sameLineMode = '違えば'
                        hasBody = false
                        // console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else if (currentNestStatement === '条件分岐') {
                        semanticNestStack.push({type:currentNestStatement, tokenIndex:currentNestTokenIndex})
                        semanticNestLevel++
                        currentNestStatement = '違えば'
                        sameLineMode = '違えば'
                        hasBody = false
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenChigaeba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (index+1 < tokenCount && token.type === 'エラー' && tokens[index+1].type === 'ならば') {
                    if (currentNestStatement === 'エラー監視') {
                        currentNestStatement = 'エラーならば'
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenErrorNaraba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (token.type === 'エラー監視') {
                    semanticNestStack.push({type:currentNestStatement, tokenIndex:currentNestTokenIndex})
                    semanticNestLevel++
                    currentNestStatement = 'エラー監視'
                    currentNestTokenIndex = index
                    // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                }
            }
            if (index+1 < tokenCount && token.type === 'NOT' && (token.value === '!' || token.value === '！') && tokens[index+1].type === 'インデント構文') {
                // !インデント構文
                logger.info('indent semantic on')
                this.isIndentSemantic = true
                skipToken = 1
            } else if (index+3 < tokenCount
                    && token.type === 'NOT' && (token.value === '!' || token.value === '！')
                    && tokens[index+1].type === 'モジュール公開既定値'
                    && tokens[index+2].type === 'EQ'
                    && (tokens[index+3].type === 'STRING' || tokens[index+3].type === 'STRING_EX')) {
                // !モジュール公開既定値は「非公開」/「公開」
                logger.info(`change default publishing:${tokens[index+3].value}`)
                this.isDefaultPrivate = tokens[index+3].value === '非公開'
                skipToken = 3
            } else if (token.type === 'def_func' && !(index>0 && tokens[index-1].type==='{' && index+1<tokenCount && tokens[index+1].type==='}')) {
                if (scopeNestLevel > 0) {
                    this.errorInfos.addFromToken('ERROR', 'declareFuncMustGlobal', {}, token)
                }
                if (this.isIndentSemantic) {
                    indentLevelStack.push({currentIndentLevel})
                    currentIndentLevel = token.indent.level
                    scopeNestLevel++
                    logger.debug(`  decl funtion:(${token.startLine},${token.startCol})${currentIndentLevel}:${currentNestStatement}`)
                } else {
                    semanticNestStack.push({type:currentNestStatement, tokenIndex:index})
                    currentNestStatement = '関数'
                    semanticNestLevel++
                    scopeNestLevel++
                    logger.debug(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                }
            } else if (token.type === 'には') {
                const symbolInfo: SymbolInfo = {
                    name: null,
                    type: '関数',
                    level: scopeNestLevel,
                    token: token
                }
                symbols.push(symbolInfo)
                if (this.isIndentSemantic) {
                    indentLevelStack.push({currentIndentLevel})
                    currentIndentLevel = token.indent.level
                    scopeNestLevel++
                } else {
                    semanticNestStack.push({type:currentNestStatement, tokenIndex:index})
                    currentNestStatement = '関数'
                    semanticNestLevel++
                    scopeNestLevel++
                    // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                }
            } else if (token.type === 'FUNCTION_NAME') {
                const symbolInfo: SymbolInfo = {
                    name: token.value,
                    type: '関数',
                    level: 0,
                    token: token
                }
                symbols.push(symbolInfo)
            } else if (index+2 < tokenCount && token.type === 'WORD' && tokens[index+1].type === 'とは' && (tokens[index+2].type === '変数' || tokens[index+2].type === '定数')) {
                // XXXとは変数/定数
                const symbolInfo: SymbolInfo = {
                    name: token.value,
                    type: tokens[index + 2].type,
                    level: scopeNestLevel,
                    token: token
                }
                symbols.push(symbolInfo)
                skipToken = 2
            } else if (index+1 < tokenCount && (token.type === '変数' || token.type === '定数') && (tokens[index+1].type === '変数' || tokens[index+1].type === 'WORD' || tokens[index+1].type === '[')) {
                if (tokens[index+1].type === '[') {
                    // 変数 [X,Y]/定数 [X,Y]
                    let i = 2
                    while (index + i < tokenCount) {
                        if (tokens[index+i].type === '変数' || tokens[index+i].type === 'WORD') {
                            const symbolInfo: SymbolInfo = {
                                name: tokens[index + i].value,
                                type: token.type,
                                level: scopeNestLevel,
                                token: tokens[index + i]
                            }
                            symbols.push(symbolInfo)
                            i++
                        } else if (tokens[index+i].type === ']') {
                            break
                        } else {
                            this.errorInfos.addFromToken('ERROR', 'syntaxError', {}, token)
                            break
                        }
                        if (index+i < tokenCount) {
                            if (tokens[index+i].type === ',') {
                                // skip ','
                                i++
                            }
                        }
                    }
                    skipToken = i
                } else {
                    // 変数 XXX/定数 XXX
                    const symbolInfo: SymbolInfo = {
                        name: tokens[index + 1].value,
                        type: token.type,
                        level: scopeNestLevel,
                        token: tokens[index + 1]
                    }
                    symbols.push(symbolInfo)
                    skipToken = 1
                }
            }
            if (currentLine !== token.endLine) {
                startCol = -1
                currentLine = token.endLine
            }
        }
        if (semanticNestStack.length > 0) {
            for (const statement of semanticNestStack) {
                const token = tokens[statement.tokenIndex]
                let type = token.type
                if (type === 'def_func') {
                    type = '関数'
                }
                this.errorInfos.addFromToken('ERROR', 'noCloseStatement', { type }, token)
            }
        }
        this.declareSymbols = symbols
        this.validDeclareSymbols = true
    }
}
