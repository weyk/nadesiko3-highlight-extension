import { EventEmitter } from 'node:events'
import { Nako3Tokenizer, COL_START } from './nako3lexer.mjs'
import { NakoParser } from './nako3/nako_parser3.mjs'
import { Token, Indent } from './nako3token.mjs'
import { ModuleLink } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { logger } from './logger.mjs'
import type { RuntimeEnv, ModuleOption } from './nako3types.mjs' 

export interface SymbolInfo {
    name: string|null
    type: string
    token: Token
    level: number
}

const kokomadePeirsStatements = [
    '回','間','繰返','増繰返','減繰返','後判定','反復','実行速度優先','パフォーマンスモニタ適用','条件分岐','条件分岐-違えば'
]

interface semanticStackInfo {
    statement: string
    tokenIndex: number
    sameLine: string
    canChigaeba: boolean
    hasBody: boolean
}
export class Nako3Document extends EventEmitter {
    lex: Nako3Tokenizer
    parser: NakoParser
    filename: string
    isErrorClear: boolean
    errorInfos: ErrorInfoManager
    isIndentSemantic: boolean
    isDefaultPrivate: boolean
    declareSymbols: SymbolInfo[]
    validDeclareSymbols: boolean
    runtimeEnv: RuntimeEnv
    runtimeEnvDefault: RuntimeEnv
    useShebang: boolean
    link: ModuleLink
    moduleOption: ModuleOption

    constructor (filename: string, link: ModuleLink) {
        super()
        this.moduleOption = {
            isIndentSemantic: false,
            isPrivateDefault: false,
            isExportDefault: true
        }
        this.lex = new Nako3Tokenizer(filename, this.moduleOption, link)
        this.parser = new NakoParser(filename, this.moduleOption, link)
        this.link = link
        this.filename = filename
        this.errorInfos = new ErrorInfoManager()
        this.isErrorClear = true
        this.isIndentSemantic = false
        this.isDefaultPrivate = false
        this.declareSymbols = []
        this.validDeclareSymbols = false
        this.runtimeEnv = ''
        this.runtimeEnvDefault = 'wnako'
        this.useShebang = true
    }

    invalidate ():void {
        this.validDeclareSymbols = false
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.problemsLimit = limit
    }

    setRuntimeEnv (runtimeEnv: RuntimeEnv) {
        if (runtimeEnv !== this.runtimeEnv) {
            this.runtimeEnv = runtimeEnv
            this.fireChangeRuntimeEnv(runtimeEnv)
        }
    }

    fireChangeRuntimeEnv (runtimeEnv: RuntimeEnv) {
        logger.debug(`doc:fireChangeRuntimeEnv(${runtimeEnv})`)
        this.emit('changeRuntimeEnv', { runtimeEnv })
    }

    tokenize (text: string):void {
        console.log(`doc:tokenize start`)
        this.lex.tokenize(text)
        this.lex.fixTokens()
        if (this.lex.runtimeEnv === '') {
            const runtimes = this.getRuntimezEnvFromPlugin()
            if (runtimes.length > 0) {
                this.lex.runtimeEnv = runtimes[0] as RuntimeEnv
            }
        }
        if (this.lex.runtimeEnv === '') {
            this.lex.runtimeEnv = this.runtimeEnvDefault
        }
        this.setRuntimeEnv(this.lex.runtimeEnv)
        this.parser.runtimeEnv = this.lex.runtimeEnv
        this.updateImportedPlugin()
        this.parser.pluginNames = this.lex.pluginNames
        this.parser.setGlobalThings(this.lex.declareThings)
        this.parser.moduleOption = this.lex.moduleOption
        this.lex.applyFunction()
        this.parser.parse(this.lex.tokens)
        this.isErrorClear = false
        this.invalidate()
        console.log(`doc:tokenize end`)
    }

    clearError ():void {
        if (!this.isErrorClear) {
            this.errorInfos.clear()
            this.isErrorClear = true
        }
    }

    getRuntimezEnvFromPlugin (): RuntimeEnv[] {
        let runtimesEnv: RuntimeEnv[] = []
        if (!this.lex.commands) {
            return []
        }
        let runtimeWork: string = ''
        for (const importInfo of this.lex.imports) {
            const imp = importInfo.value
            if (/\.nako3?$/.test(imp)) {
                continue
            }
            const r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
            if (r && r.length > 1) {
                const plugin = r[1]
                if (this.lex.commands.has(plugin)) {
                    const runtimes = this.lex.commands.getRuntimesFromPlugin(plugin)
                    if (runtimes) {
                        if (runtimeWork === '') {
                            runtimeWork = runtimes
                        } else if (runtimeWork === runtimes) {
                            // nop
                        } else if (runtimeWork.indexOf(',') >= 0) {
                            if (runtimes.indexOf(',') >= 0) {
                                const r0 = runtimeWork.split(',')
                                const r1 = runtimes.split(',')
                                const r2:string[] = []
                                for (const r of r1) {
                                    if (r0.includes(r)) {
                                        r2.push(r)
                                    }
                                }
                                if (r2.length > 0) {
                                    runtimeWork = r2.join(',')
                                } else {
                                    runtimeWork = 'invalid'
                                }
                            } else {
                                if (runtimeWork.split(',').includes(runtimes)) {
                                    runtimeWork = runtimes
                                } else {
                                    runtimeWork = 'invalid'
                                }
                            }
                        } else {
                            if (runtimes.indexOf(',') >= 0) {
                                if (runtimes.split(',').includes(runtimeWork)) {
                                    // nop
                                } else {
                                    runtimeWork = 'invalid'
                                }
                            } else {
                                runtimeWork = 'invalid'
                            }
                        }
                    }
                }
            }
        }
        if (runtimeWork === '') {
            runtimesEnv = []
        } else if (runtimeWork === 'invalid') {
            this.errorInfos.add('WARN', 'conflictRuntimeEnv', { }, 0, 0, 0, 0)
            runtimesEnv = []
        } else {
            runtimesEnv = runtimeWork.split(',') as RuntimeEnv[]
        }
        return runtimesEnv
    }

    updateImportedPlugin ():void {
        this.lex.pluginNames.length = 0
        this.link.imports = []
        for (const importInfo of this.lex.imports) {
            const imp = importInfo.value
            this.link.imports.push(imp)
            if (/\.nako3?$/.test(imp)) {
                logger.info(`imports:skip nako3 file:${imp}`)
                this.errorInfos.add('WARN', 'noImportNako3', { file: imp }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                continue
            }
            const r = /[\\\/]?((plugin_|nadesiko3-)[a-zA-Z0-9][-_a-zA-Z0-9]*)(\.(js|mjs|cjs))?$/.exec(imp)
            if (r && r.length > 1) {
                const plugin = r[1]
                logger.info(`imports:add js plugin:${plugin}`)
                this.lex.pluginNames.push(plugin)
                if (this.lex.commands) {
                    if (!this.lex.commands.has(plugin)) {
                        this.errorInfos.add('WARN', 'noSupport3rdPlugin', { plugin }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                        this.lex.commands.importFromFile(imp, this.link, this.errorInfos)
                        if (!this.lex.commands.has(plugin)) {
                            this.errorInfos.add('WARN', 'noPluginInfo', { plugin }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
                        }
                    }
                }
            } else {
                this.errorInfos.add('WARN', 'unknownImport', { file:imp }, importInfo.startLine, importInfo.startCol, importInfo.endLine, importInfo.endCol)
            }
        }
    }

    getTokenByPosition(line: number, col: number): Token|null {
        const index = this.getTokenIndexByPosition(line, col)
        if (index === null) {
            return null
        }
        return this.lex.tokens[index]
    }

    debugLogToken (msg:string, token:Token|null):void {
        if (token === null) {
            return
        }
        console.log(`${msg} token(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
    }

    searchTokenByPosition(tokens: Token[], line: number, col: number): number|null {
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

    getTokenIndexByPosition(line: number, col: number): number|null {
        let index = this.searchTokenByPosition(this.lex.tokens, line, col)
        if (index === null) {
            index = this.searchTokenByPosition(this.lex.commentTokens, line, col)
        }
        return index
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
        const semanticNestStack:semanticStackInfo[] = []
        let semanticNestLevel = 0
        let currentNestStatement = 'グローバル'
        let currentNestTokenIndex = 0
        const symbols: SymbolInfo[] = []
        let wasKokomadeError = false
        let sameLineMode:string = ''
        let hasBody = false
        let canChigaeba = false
        const semanticPush = (statement: string, index: number) => {
            semanticNestStack.push({
                statement: currentNestStatement,
                tokenIndex: currentNestTokenIndex,
                sameLine: sameLineMode,
                canChigaeba: canChigaeba,
                hasBody: hasBody && sameLineMode === currentNestStatement
            })
            semanticNestLevel++
            currentNestStatement = statement
            currentNestTokenIndex = index
            logger.log(`semantic stack:push:${semanticNestStack.length}:${tokens[index].startLine}:${statement}`)
        }
        const semanticPop = (index: number) => {
            const nestStatement = semanticNestStack.pop()
            if (nestStatement) {
                currentNestStatement = nestStatement.statement
                currentNestTokenIndex = nestStatement.tokenIndex
                sameLineMode = nestStatement.sameLine
                canChigaeba = nestStatement.canChigaeba
                hasBody = nestStatement.hasBody
            } else {
                sameLineMode = ''
                canChigaeba = false
                hasBody = false
                    // console.log('semanticNestLevel: over pop')
            }
            semanticNestLevel--
            logger.log(`semantic stack:pop :${semanticNestStack.length}:${tokens[index].startLine}:${tokens[currentNestTokenIndex].startLine}:${currentNestStatement}`)
            // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
        }
        const semanticChange = (statement: string, index: number) => {
            currentNestStatement = statement
            logger.log(`semantic stack:chng:${semanticNestStack.length}:${tokens[index].startLine}:${tokens[currentNestTokenIndex].startLine}:${currentNestStatement}`)
        }
        for (let index = 0; index < tokenCount; index++) { 
            const token = tokens[index]
            if (currentLine !== token.startLine ) {
                let reccursive:boolean
                do {
                    reccursive = false
                    canChigaeba = false
                    if (sameLineMode === 'もし') {
                        this.errorInfos.addFromToken('ERROR', 'mustThenFollowIf', {}, token)
                    } else if (sameLineMode === '条件分岐-ならば' && hasBody) {
                        logger.log('              :条件分岐-ならば has immediate body')
                        semanticPop(index)
                    } else if (sameLineMode === '条件分岐-違えば' && hasBody) {
                        logger.log('              :条件分岐-違えば has immediate body')
                        semanticPop(index)
                    } else if (sameLineMode === 'もし-ならば' && hasBody) {
                        logger.log('              :もし-ならば has immediate body')
                        canChigaeba = true
                        logger.log('              :can follow 違えば next line')
                    } else if (sameLineMode === 'もし-違えば' && hasBody) {
                        logger.log('              :もし-違えば has immediate body')
                        semanticPop(index)
                        reccursive = true
                    }
                } while (reccursive)
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
            if (false && ((token.type === '定数' || token.type === '変数') || (token.type === 'word' && (token.value === '定数' || token.value === '変数')))) {
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
                if (!hasBody && ![','].includes(token.type)) {
                    if (sameLineMode === 'もし-違えば' && token.type === 'もし') {
                        logger.log('              :違えば-もし has been appear')
                    } else {
                        if (token.type !== 'eol') {
                            hasBody = true
                            logger.log(`              :has body:(${token.startLine},${token.startCol}):${token.type}:${token.value}`)
                        }
                    }
                    let reccursive:boolean
                    do {
                        reccursive = false
                        if (canChigaeba && token.type !== '違えば') {
                            logger.log('              :can follow 違えば, but not it')
                            // console.log('      can follow chigaeba, but not it')
                            canChigaeba = false
                            semanticPop(index)
                            if (currentNestStatement === 'もし-ならば' && hasBody) {
                                canChigaeba = true
                                logger.log('              :can follow 違えば next line')
                            }
                            reccursive=true                            
                            // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                        }
                    } while (reccursive)
                }
                if (index+1 < tokenCount && token.type === '回' && tokens[index+1].type === '繰返') {
                    semanticPush(token.type, index)
                    skipToken = 1
                } else if (kokomadePeirsStatements.includes(token.type)) {
                    semanticPush(token.type, index)
                    // console.log(`  semantic nest:${semanticNestLevel}:${currentNestStatement}`)
                } else if (token.type === 'ここまで') {
                    if (kokomadePeirsStatements.includes(currentNestStatement)) {
                    } else if (currentNestStatement === '関数') {
                        scopeNestLevel--
                    } else if (currentNestStatement === 'エラーならば') {
                    } else if (currentNestStatement === 'もし-ならば') {
                    } else if (currentNestStatement === 'もし-違えば') {
                    } else if (currentNestStatement === '条件分岐-ならば') {
                    } else if (currentNestStatement === '条件分岐-違えば') {
                    } else {
                        // console.log(`      kokomade cause invalid pair:${semanticNestLevel}:${currentNestStatement}`)
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenKokomade', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                    semanticPop(index)
                    hasBody = false
                    sameLineMode = ''
                    canChigaeba = false
                    // console.log(`  semantic pop :(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                } else if (token.type === 'もし') {
                    if (sameLineMode === 'もし-違えば' && !hasBody) {
                        semanticChange(token.type, index)
                       //  console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        semanticPush(token.type, index)
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    }
                    sameLineMode = 'もし'
                    hasBody = false
                } else if (token.type === '条件分岐') {
                    semanticPush(token.type, index)
                    // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    hasBody = false
                } else if (token.type === 'ならば') {
                    if (!hasBody) {
                        // console.log(`      naraba before no body`)
                    }
                    if (currentNestStatement === 'もし') {
                        semanticChange('もし-ならば', index)
                        sameLineMode = 'もし-ならば'
                        hasBody = false
                        // console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else if (currentNestStatement === '条件分岐') {
                        semanticPush('条件分岐-ならば', index)
                        sameLineMode = '条件分岐-ならば'
                        hasBody = false
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenNaraba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (token.type === '違えば') {
                    if (currentNestStatement === 'もし-ならば' || canChigaeba) {
                        if (canChigaeba) {
                            // console.log(`      can follow chigaeba, it now.`)
                            canChigaeba = false
                        }
                        semanticChange('もし-違えば', index)
                        sameLineMode = 'もし-違えば'
                        hasBody = false
                        // console.log(`  semantic cang:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else if (currentNestStatement === '条件分岐') {
                        semanticPush('条件分岐-違えば', index)
                        sameLineMode = '条件分岐-違えば'
                        hasBody = false
                        // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenChigaeba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (index+1 < tokenCount && token.type === 'エラー' && tokens[index+1].type === 'ならば') {
                    if (currentNestStatement === 'エラー監視') {
                        semanticChange('エラーならば', index)
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'invalidTokenErrorNaraba', { nestLevel: semanticNestLevel, statement: currentNestStatement}, token)
                    }
                } else if (token.type === 'エラー監視') {
                    semanticPush(token.type, index)
                    // console.log(`  semantic nest:(${token.startLine},${token.startCol})${semanticNestLevel}:${currentNestStatement}`)
                }
            }
            if (index+1 < tokenCount && token.type === 'not' && (token.value === '!' || token.value === '！') && tokens[index+1].type === 'インデント構文') {
                // !インデント構文
                // logger.info('indent semantic on')
                this.isIndentSemantic = true
                skipToken = 1
            } else if (index+3 < tokenCount
                    && token.type === 'not' && (token.value === '!' || token.value === '！')
                    && tokens[index+1].type === 'モジュール公開既定値'
                    && tokens[index+2].type === 'eq'
                    && (tokens[index+3].type === 'string' || tokens[index+3].type === 'STRING_EX')) {
                // !モジュール公開既定値は「非公開」/「公開」
                // logger.info(`change default publishing:${tokens[index+3].value}`)
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
                    semanticPush('関数', index)
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
                    semanticPush('関数', index)
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
            } else if (index+2 < tokenCount && token.type === 'word' && tokens[index+1].type === 'とは' && (tokens[index+2].type === '変数' || tokens[index+2].type === '定数')) {
                // XXXとは変数/定数
                const symbolInfo: SymbolInfo = {
                    name: token.value,
                    type: tokens[index + 2].type,
                    level: scopeNestLevel,
                    token: token
                }
                symbols.push(symbolInfo)
                skipToken = 2
            } else if (index+1 < tokenCount && (token.type === '変数' || token.type === '定数') && (tokens[index+1].type === '変数' || tokens[index+1].type === 'word' || tokens[index+1].type === '[')) {
                if (tokens[index+1].type === '[') {
                    // 変数 [X,Y]/定数 [X,Y]
                    let i = 2
                    while (index + i < tokenCount) {
                        if (tokens[index+i].type === '変数' || tokens[index+i].type === 'word') {
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
                if (statement.statement !== 'グローバル') {
                    const token = tokens[statement.tokenIndex]
                    let type:string = token.type
                    if (type === 'def_func') {
                        type = '関数'
                    }
                    this.errorInfos.addFromToken('ERROR', 'noCloseStatement', { type }, token)
                }
            }
            if (currentNestStatement !== 'グローバル') {
                this.errorInfos.addFromToken('ERROR', 'noCloseStatement', { type: currentNestStatement }, tokens[currentNestTokenIndex])
            }
        }
        this.declareSymbols = symbols
        this.validDeclareSymbols = true
    }
}
