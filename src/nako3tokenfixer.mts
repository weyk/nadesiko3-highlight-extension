import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { ModuleEnv, ModuleOption, ModuleLink } from './nako3module.mjs'
import { Nako3Range } from './nako3range.mjs'
import { tararebaMap } from './nako3/nako_josi_list.mjs'
import { trimOkurigana, filenameToModName } from './nako3util.mjs'
import { logger } from './logger.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import type { DeclareFunction, FunctionArg } from './nako3types.mjs'
import type { Token, TokenDefFunc, TokenRefFunc, TokenType } from './nako3token.mjs'

export interface ImportStatementInfo {
    value: string
    tokenIndex: number
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export interface TokenFixerResult {
    tokens: Token[]
    commentTokens: Token[]
    imports: ImportStatementInfo[]
}

export class Nako3TokenFixer {
    // rawTokensから書き換えのあるトークン列。ただしコメントは除く。
    private tokens: Token[]
    private commentTokens: Token[]
    public errorInfos: ErrorInfoManager
    private imports: ImportStatementInfo[]
    private moduleOption: ModuleOption
    private moduleEnv: ModuleEnv

    constructor (moduleEnv: ModuleEnv, moduleOption: ModuleOption, link: ModuleLink) {
        this.moduleEnv = moduleEnv
        this.moduleOption = moduleOption
        this.errorInfos = new ErrorInfoManager()
        this.tokens = []
        this.imports = []
        this.commentTokens = []
    }

    public setProblemsLimit (limit: number):void {
        this.errorInfos.problemsLimit = limit
    }

    public fixTokens (rawTokens: Token[]): TokenFixerResult {
        this.errorInfos.clear()
        this.tokens = []
        this.commentTokens = []
        this.moduleOption.reset()
        this.moduleEnv.nakoRuntime = ''
        this.moduleEnv.declareThings.clear()
        this.imports = []
        let token:Token
        let rawToken:Token|null = null
        let reenterToken:Token[] = []
        const functionIndex:number[] = []
        const preprocessIndex: number[] = []
        let topOfLine = true
        let isLine0Col0 = true
        let delayedToken: Token|null = null
        const pushToken = (token: Token) => {
            let type = token.type
            if ((type === 'def_func' || type === '*') && token.startCol === 0 && token.josi === '') {
                functionIndex.push(this.tokens.length)
                if (type === '*') {
                    logger.info(`tokenize: function start with token-type '*'. not 'def_fund'`)
                }
            } else if (type === 'には') {
                functionIndex.push(this.tokens.length)
            }
            if (type === 'COMMENT_LINE' || type === 'COMMENT_BLOCK' || type === '_eol') {
                if (isLine0Col0 && type === 'COMMENT_LINE') {
                    if (nako3extensionOption.useShebang && token.text.startsWith('#!')) {
                        if (token.text.includes('snako')) {
                            this.moduleEnv.nakoRuntime = 'snako'
                        } else if (token.text.includes('cnako')) {
                            this.moduleEnv.nakoRuntime = 'cnako'
                        }
                    }
                }
                this.commentTokens.push(token)
            } else {
                if (type === 'eol') {
                    topOfLine = true
                } else {
                    if (topOfLine && type === 'not') {
                        preprocessIndex.push(this.tokens.length)
                    }
                    topOfLine = false
                }
                this.tokens.push(token)
            }
        }
        for (let i = 0; i < rawTokens.length;) {
            if (reenterToken.length > 0) {
                rawToken = reenterToken.shift()!
            } else {
                rawToken = rawTokens[i]
                i++
            }
            token = Object.assign({}, rawToken)
            let requirePush = true
            let type = rawToken.type

            // 「回」で終わるWORDから「回」を分離する。
            if (type === 'word' && rawToken.josi === '' && rawToken.value.length >= 2) {
                if (rawToken.value.match(/回$/)) {
                    token = Object.assign({}, rawToken, {
                        type,
                        value : rawToken.value.slice(0, -1),
                        text : rawToken.text.slice(0, -1),
                        len : rawToken.len - 1,
                        endCol : rawToken.endCol - 1,
                        resEndCol: rawToken.resEndCol - 1,
                    })
                    reenterToken.push(token)
                    token = Object.assign({}, rawToken, {
                        startCol: rawToken.endCol - 1,
                        endCol: rawToken.endCol,
                        resEndCol: rawToken.endCol,
                        len: 1,
                        type: '回',
                        group: '制御',
                        text: '回',
                        value: '回',
                    })
                    reenterToken.push(token)
                    requirePush = false
                    continue
                }
            }
            if (typeof rawToken.josi === 'undefined') {
                token.josi = ''
            }
            if ((rawToken.josi === 'には' || rawToken.josi === 'は~' || rawToken.josi === 'は～') && typeof rawToken.josiStartCol === 'number') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.josiStartCol,
                    text: rawToken.text.slice(0, - (rawToken.len - rawToken.josiStartCol!)),
                    endCol: rawToken.josiStartCol,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'には',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol,
                    josi: '',
                    josiStartCol: null,
                    text: rawToken.text.substring(rawToken.len - rawToken.josiStartCol),
                    value: 'には',
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (rawToken.josi === 'は') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.len - 1,
                    text: rawToken.text.slice(0, -1),
                    endCol: rawToken.endCol - 1,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'eq',
                    group: '演算子',
                    len: 1,
                    text: '=',
                    value: '=',
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.endCol - 1,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (rawToken.josi === 'とは' && typeof rawToken.josiStartCol === 'number') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.josiStartCol,
                    text: rawToken.text.slice(0, - (rawToken.len - rawToken.josiStartCol)),
                    endCol: rawToken.josiStartCol,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'とは',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol!,
                    josi: '',
                    josiStartCol: null,
                    text: rawToken.text.substring(rawToken.len - rawToken.josiStartCol),
                    value: 'とは',
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (tararebaMap[rawToken.josi] && typeof rawToken.josiStartCol === 'number') {
                const rawJosi = rawToken.josi
                const josi = (rawJosi === 'でなければ' || rawJosi === 'なければ') ? 'でなければ' : 'ならば'
                token = Object.assign({}, rawToken, {
                    type,
                    len: rawToken.len - rawJosi.length,
                    text: rawToken.text.slice(0, - (rawToken.endCol - rawToken.josiStartCol)),
                    endCol: rawToken.josiStartCol,
                    josiStartCol: null,
                    josi: '',
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'ならば',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol,
                    text: rawJosi,
                    value: josi,
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.josiStartCol + rawJosi.length,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (requirePush) { 
                token.type = type
                if (delayedToken === null) {
                    delayedToken = token
                } else {
                    if (delayedToken.type === 'word' && delayedToken.value === '_' && delayedToken.josi === '' && token.type === 'eol') {
                        token.startLine = delayedToken.startLine
                        token.startCol = delayedToken.startCol
                        token.len = token.endCol - delayedToken.startCol
                        token.text = '_\n'
                        token.value = '_\n'
                        token.type = '_eol'
                        delayedToken = null
                    } else if (delayedToken.type === 'エラー' && token.type === 'ならば' && delayedToken.josi === '' && delayedToken.endCol === token.startCol) {
                        token.startLine = delayedToken.startLine
                        token.startCol = delayedToken.startCol
                        token.len = token.endCol - delayedToken.startCol
                        token.text = 'エラーならば'
                        token.value = 'エラーならば'
                        token.type = 'エラーならば'
                        delayedToken = null
                    } else if (delayedToken.type === 'word' && delayedToken.value === '永遠' && delayedToken.josi === 'に' && token.type === 'word' && trimOkurigana(token.value) === '繰返') {
                        // 永遠に繰り返す→永遠の間に置換 #1686
                        token.value = '間'
                        token.josi = 'の'
                    }
                    if (delayedToken) {
                        pushToken(delayedToken)
                        isLine0Col0 = false
                    }
                    delayedToken = token
                }
            }
        }
        if (delayedToken) {
            pushToken(delayedToken)
        }

        if (this.tokens.length > 0) {
            const lastToken = this.tokens[this.tokens.length - 1]
            this.tokens.push({
                type: 'eol',
                group: '区切',
                len: 0,
                lineCount: 0,
                startLine: lastToken.endLine,
                startCol: lastToken.endCol,
                endLine: lastToken.endLine,
                endCol: lastToken.endCol,
                resEndCol: lastToken.endCol,
                text: '---',
                value: ';',
                unit: '',
                josi: '',
                indent: { len: 0, level: 0, text: '' },
                uri: lastToken.uri,
                asWord: false
            })
            this.tokens.push({
                type: 'eof',
                group: '区切',
                len: 0,
                lineCount: 0,
                startLine: lastToken.endLine,
                startCol: lastToken.endCol,
                endLine: lastToken.endLine,
                endCol: lastToken.endCol,
                resEndCol: lastToken.endCol,
                text: '',
                value: '',
                unit: '',
                josi: '',
                indent: { len: 0, level: 0, text: '' },
                uri: lastToken.uri,
                asWord: false
            })
        } else {
            this.tokens.push({
                type: 'eol',
                group: '区切',
                len: 0,
                lineCount: 0,
                startLine: 0,
                startCol: 0,
                endLine: 0,
                endCol: 0,
                resEndCol: 0,
                text: '---',
                value: ';',
                unit: '',
                josi: '',
                indent: { len: 0, level: 0, text: '' },
                uri: this.moduleEnv.uri,
                asWord: false
            })
            this.tokens.push({
                type: 'eof',
                group: '区切',
                len: 0,
                lineCount: 0,
                startLine: 0,
                startCol: 0,
                endLine: 0,
                endCol: 0,
                resEndCol: 0,
                text: '',
                value: '',
                unit: '',
                josi: '',
                indent: { len: 0, level: 0, text: '' },
                uri: this.moduleEnv.uri,
                asWord: false
            })
        }
        this.preprocess(preprocessIndex)
        this.enumlateFunction(functionIndex)
        const tokens = this.tokens
        const commentTokens = this.commentTokens
        const imports = this.imports
        this.tokens = []
        this.commentTokens = []
        this.imports = []
        return {
            tokens,
            commentTokens,
            imports
        }
    }

    private preprocess (preprocessIndex: number[]):void {
        let token: Token
        const tokens = this.tokens
        const tokenCount = tokens.length
        for (const index of preprocessIndex) {
            let hit = false
            let causeError = false
            let i = index
            let targetToken: Token|null = null
            let targetType: TokenType = '?'
            token = tokens[i]
            if (!(token.type === 'not' && (token.value === '!' || token.value === '！'))) {
                logger.log(`internal error: invalid token, expected 'NOT' token`)                
            }
            i++
            token = tokens[i]
            if (token.type === 'word' && trimOkurigana(token.value) === '厳チェック') {
                this.moduleOption.isStrict = true
                targetToken = token
                targetType = '厳チェック'
                logger.info('strict on')
                hit = true
            } else if (token.type === 'word' && token.value === '非同期モード') {
                this.moduleOption.isAsync = true
                targetToken = token
                targetType = '非同期モード'
                logger.info('async mode on')
                logger.log('『非同期モード』構文は廃止されました(https://nadesi.com/v3/doc/go.php?1028)。', token)
                this.errorInfos.addFromToken('WARN', 'deprecatedAsync', {}, tokens[index], token)
                hit = true
            } else if (token.type === 'word' && token.value === 'DNCLモード') {
                this.moduleOption.isDNCL = true
                targetToken = token
                targetType = 'DNCLモード'
                this.errorInfos.addFromToken('WARN', 'noSupportDNCL', {}, tokens[index], token)
                logger.info('DNCL1 mode on')
                hit = true
            } else if (token.type === 'word' && ['DNCL2モード','DNCL2'].includes(token.value)) {
                this.moduleOption.isDNCL2 = true
                targetToken = token
                targetType = 'DNCL2モード'
                this.errorInfos.addFromToken('WARN', 'noSupportDNCL', {}, tokens[index], token)
                logger.info('DNCL2 mode on')
                hit = true
            } else if (token.type === 'word' && token.value === 'インデント構文') {
                this.moduleOption.isIndentSemantic = true
                targetToken = token
                targetType = 'インデント構文'
                logger.info('indent semantic on')
                hit = true
            } else if (token.type === 'word' && token.value === 'モジュール公開既定値') {
                targetToken = token
                targetType = 'モジュール公開既定値'
                i++
                token = tokens[i]
                if (token.type === 'eq') {
                    i++
                    token = tokens[i]
                    if (token.type === 'string') {
                        this.moduleOption.isPrivateDefault = token.value === '非公開'
                        this.moduleOption.isExportDefault = token.value === '公開'
                        logger.info(`change default publishing:${token.value}`)
                    } else if (token.type === 'STRING_EX') {
                        this.errorInfos.addFromToken('ERROR', `cannotUseTemplateString`, {}, token)
                        causeError = true
                    } else {
                        this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocess`, { type: token.type, value: token.value }, token)
                        causeError = true
                    }
                } else {
                    this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocessExpected`, { expected:'=', type: token.type, value: token.value }, token)
                    causeError = true
                }
                hit = true
            } else if (i+1 < tokenCount && token.type === 'string' && token.josi === 'を' && tokens[i+1].type === 'word' && trimOkurigana(tokens[i+1].value) === '取込') {
                targetToken = token
                targetType = '取込'
                logger.info(`import file:${token.value}`)
                const importInfo: ImportStatementInfo = {
                    value: token.value,
                    tokenIndex: i,
                    startLine: tokens[i-1].startLine,
                    startCol: tokens[i-1].startCol,
                    endLine: tokens[i+1].endLine,
                    endCol: tokens[i+1].endCol
                }
                this.imports.push(importInfo)
                i += 1
                hit = true
            }
            if (hit) {
                tokens[index].type = '!'
                if (targetToken) {
                    targetToken.type = targetType
                }
                if (!causeError) {
                    i++
                    token = tokens[i]
                    if (!(token.type === 'eol')) {
                        this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocessExpected`, { expected:'EOL', type: token.type, value: token.value }, token)
                    }
                }
            }
        }
    }

    private enumlateFunction (functionIndex: number[]):void {
        let args = new Map<string, FunctionArg>()
        let argOrder: string[] = []
        const parseArguments = (i:number):number => {
            // jに先頭位置、iに最短の')'またはEOLの位置を求める。
            let token: Token
            let j = i
            for (;i < this.tokens.length && this.tokens[i].type !== ')' && this.tokens[i].type !== 'eol';i++) {
                //
            }
            if (j < i && this.tokens[i].type === ')') {
                token = this.tokens[j]
                if (token.type === '(') {
                    token.type = 'FUNCTION_ARG_PARENTIS_START'
                    j++
                }
                while (j <= i) {
                    let attr: string[] = []
                    let varname: string = ''
                    let josi: string[] = []
                    token = this.tokens[j]
                    let k = j
                    if (token.type === '{') {
                        token.type = 'FUNCTION_ARG_ATTR_START'
                        j++
                        token = this.tokens[j]
                        if (token.type === 'word') {
                            token.type = 'FUNCTION_ARG_ATTRIBUTE'
                            attr.push(token.value)
                            j++
                            token = this.tokens[j]
                        }
                        if (token.type === '}') {
                            token.type = 'FUNCTION_ARG_ATTR_END'
                            j++
                            token = this.tokens[j]
                        }
                    }
                    if (token.type === 'word') {
                        token.type = 'FUNCTION_ARG_PARAMETER'
                        varname = token.value
                        if (args.has(varname)) {
                            const arg = args.get(varname)
                            josi = arg!.josi
                            arg!.attr.push(...attr)
                            attr = arg!.attr
                        } else {
                            const arg = {
                                varname, attr, josi, range: Nako3Range.fromToken(token)
                            }
                            args.set(varname, arg)
                            argOrder.push(varname)
                        }
                        if (token.josi !== '') {
                            josi.push(token.josi)
                        }
                        j++
                        token = this.tokens[j]
                    }
                    if (token.type === ',' || token.type === '|') {
                        token.type = 'FUNCTION_ARG_SEPARATOR'
                        j++
                        token = this.tokens[j]
                    }
                    if (token.type === ')') {
                        token.type = 'FUNCTION_ARG_PARENTIS_END'
                        j++
                        token = this.tokens[j]
                    }
                    if (j === k) {
                        this.errorInfos.addFromToken('ERROR', 'unknownTokenInFuncParam', {type: token.type}, token)
                        break
                    }
                }
                if (j !== i + 1) {
                    token = this.tokens[j]
                    this.errorInfos.addFromToken('ERROR', 'unknownTokenInFuncParam', {type: token.type}, token)
                }
                i++
            } else {
                this.errorInfos.addFromToken('ERROR', 'noFunctionParamParentisR', {token:this.tokens[j].type}, this.tokens[j])
            }
            return i
        }
        let token: Token
        for (const index of functionIndex) {
            let i = index
            let isMumei = false
            let isPrivate = this.moduleOption.isPrivateDefault
            let isExport = this.moduleOption.isExportDefault
            args = new Map<string, FunctionArg>()
            argOrder = []
            token = this.tokens[i]
            if (token.type === '*') {
                token.type = 'def_func'
            }
            if (token.type === 'には') {
                isMumei = true
                token.type = 'def_func'
            }
            i++
            token = this.tokens[i]
            if (!isMumei && token.type === '{') {
                let j = i
                for (;i < this.tokens.length && this.tokens[i].type !== '}' && this.tokens[i].type !== 'eol';i++) {
                    //
                }
                if (this.tokens[i].type === '}') {
                    this.tokens[j].type = 'FUNCTION_ATTR_PARENTIS_START'
                    j++
                    this.tokens[i].type = 'FUNCTION_ATTR_PARENTIS_END'
                    for (;j < i;j++) {
                        token = this.tokens[j]
                        token.type = 'FUNCTION_ATTRIBUTE'
                        if (token.value === '非公開') {
                            isPrivate = true
                            isExport = false
                        } else if (token.value === '公開') {
                            isExport = true
                            isPrivate = false
                        }
                    }
                    i++
                }
            }
            let hasParameter = false
            token = this.tokens[i]
            if (token.type === '(') {
                i = parseArguments(i)
                hasParameter = true
            }
            token = this.tokens[i]
            let hasToha = false
            let funcName: string = ''
            let funcNameIndex: number|null = null
            if (!isMumei && token.type === 'word') {
                token.type = 'FUNCTION_NAME'
                funcName = token.value
                funcNameIndex = i
                if (token.josi === 'とは') {
                    hasToha = true
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasToha && (token.type === 'とは' || (token.type === 'word' && token.value === 'とは'))) {
                if (token.type === 'word' && token.value === 'とは') {
                    console.warn(`とは type was WORD`)
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasParameter && token.type === '(') {
                i = parseArguments(i)
                hasParameter = true
            }
            const orderedArgs: FunctionArg[] = []
            for (const orderKey of argOrder) {
                const arg = args.get(orderKey)!
                orderedArgs.push(arg)
            }
            this.addUserFunction(funcName, orderedArgs, isExport, isPrivate, isMumei, funcNameIndex, index)
        }
    }

    private addUserFunction (name: string, args: FunctionArg[], isExport: boolean, isPrivate: boolean, isMumei: boolean, funcNameIndex: number|null, defTokenIndex: number):void {
        const nameTrimed = name.trim()
        const nameNormalized = trimOkurigana(nameTrimed)
        const declFunction: DeclareFunction = {
            name: nameTrimed,
            nameNormalized: nameNormalized,
            modName: this.moduleEnv.modName,
            uri: this.moduleEnv.uri,
            type: 'func',
            isMumei,
            args: args,
            isPure: true,
            isAsync: false,
            isVariableJosi: false,
            isExport,
            isPrivate,
            range: Nako3Range.fromToken(this.tokens[funcNameIndex ? funcNameIndex : defTokenIndex]),
            scopeId: null,
            origin: 'global',
            isRemote: this.moduleEnv.isRemote
        }
        if (nameTrimed.length > 0) {
            this.moduleEnv.declareThings.set(nameNormalized, declFunction)
        }
        (this.tokens[defTokenIndex] as TokenDefFunc).meta = declFunction
        if (funcNameIndex) {
            (this.tokens[funcNameIndex] as TokenRefFunc).meta = declFunction
        }
    }
}
