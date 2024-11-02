import { CancellationToken } from 'vscode'
import { Nako3Tokenizer, TokenizeResult } from './nako3lexer.mjs'
import { ImportStatementInfo, Nako3TokenFixer } from './nako3tokenfixer.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { Nako3TokenApplyer } from './nako3tokenapplyer.mjs'
import { NakoParser } from './nako3/nako_parser3.mjs'
import { ModuleLink, ModuleEnv, ModuleOption } from './nako3module.mjs'
import { setSerialId, incSerialId } from './nako3util.mjs'
import { nako3extensionOption } from './nako3option.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { logger } from './logger.mjs'
import type { Token } from './nako3token.mjs'
import type { NakoRuntime } from './nako3types.mjs'

export class Nako3Document {
    text: string
    textVersion: number|null
    lexer: Nako3Tokenizer
    fixer: Nako3TokenFixer
    applyer: Nako3TokenApplyer
    parser: NakoParser
    filename: string
    errorInfos: ErrorInfoManager
    public lexerResult: TokenizeResult
    public tokens: Token[]
    public commentTokens: Token[]
    lengthLines: number[]
    validRawToken: boolean
    validFixToken: boolean
    validNakoRuntime: boolean
    validApplyerFuncToken: boolean
    validApplyerVarToken: boolean
    validAst: boolean
    rawTokenSerialId: number
    fixTokenSerialId: number
    applyerFuncTokenSerialId: number
    applyerVarTokenSerialId: number
    astSerialId: number
    nakoRuntime: NakoRuntime
    link: ModuleLink
    moduleEnv: ModuleEnv
    moduleOption: ModuleOption
    onChangeNakoRuntime: ((nakoRuntime: NakoRuntime) => void)|null
    onRefreshLink: ((importInfo: ImportStatementInfo[]) => Promise<void>)|null

    constructor(filename: string, link: ModuleLink) {
        this.moduleOption = new ModuleOption()
        this.moduleEnv = new ModuleEnv(filename, link)
        this.text = ''
        this.textVersion = null
        this.lexer = new Nako3Tokenizer(this.moduleEnv, link)
        this.fixer = new Nako3TokenFixer(this.moduleEnv, this.moduleOption, link)
        this.applyer = new Nako3TokenApplyer(this.moduleEnv, this.moduleOption, link)
        this.parser = new NakoParser(this.moduleEnv, this.moduleOption, link)
        this.link = link
        this.filename = filename
        this.errorInfos = new ErrorInfoManager()
        this.lexerResult = { tokens: [], lengthLines: [] }
        this.tokens = []
        this.commentTokens = []
        this.lengthLines = []
        this.rawTokenSerialId = setSerialId()
        this.fixTokenSerialId = setSerialId()
        this.applyerFuncTokenSerialId = setSerialId()
        this.astSerialId = setSerialId()
        this.applyerVarTokenSerialId = setSerialId()
        this.validRawToken = false
        this.validFixToken = false
        this.validNakoRuntime = false
        this.validApplyerFuncToken = false
        this.validAst = false
        this.validApplyerVarToken = false
        this.nakoRuntime = ''
        this.onChangeNakoRuntime = null
        this.onRefreshLink = null
    }

    updateText (text: string, textVersion: number|null): boolean {
        if (textVersion === null || textVersion !== this.textVersion) {
            this.textVersion = textVersion
            if (this.text !== text) {
                logger.info(`doc:text update:${this.filename}.`)
                this.text = text
                this.invalidate()
                return true
            }
        }
        return false
    }

    invalidate(): void {
        this.validRawToken = false
        this.validFixToken = false
        this.validApplyerFuncToken = false
        this.validNakoRuntime = false
        this.validApplyerVarToken = false
        this.validAst = false
    }

    setNakoRuntime(nakoRuntime: NakoRuntime) {
        if (nakoRuntime !== this.nakoRuntime) {
            this.nakoRuntime = nakoRuntime
            this.fireChangeNakoRuntime(nakoRuntime)
        }
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.problemsLimit = limit
    }

    fireChangeNakoRuntime(nakoRuntime: NakoRuntime) {
        logger.debug(`doc:fireChangeNakoRuntime(${nakoRuntime})`)
        if (this.onChangeNakoRuntime) {
            this.onChangeNakoRuntime(nakoRuntime)
        }
    }

    async fireRefreshLink(imports: ImportStatementInfo[]) {
        logger.debug(`doc:fireRefreshLink()`)
        if (this.onRefreshLink) {
            await this.onRefreshLink(imports)
        }
    }

    async tokenize(canceltoken?: CancellationToken): Promise<void> {
        console.info(`doc:tokenize start:${this.filename}`)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return
        }
        // tokenizerを使用してtextからrawTokens/lineLengthsを生成する
        if (!this.validRawToken) {
            this.lexerResult = this.lexer.tokenize(this.text)
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.validRawToken = true
            this.rawTokenSerialId = incSerialId(this.rawTokenSerialId)
            this.validFixToken = false
        }
        // tokenFixerを使用してrawTokenからtokens/commentTokensを生成する
        if (!this.validFixToken) {
            const fixerResult = this.fixer.fixTokens(this.lexerResult.tokens)
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.tokens = fixerResult.tokens
            this.commentTokens = fixerResult.commentTokens
            this.fixTokenSerialId = incSerialId(this.fixTokenSerialId)
            this.validFixToken = true
            this.validNakoRuntime = false
        }
        if (!this.validNakoRuntime) {
            this.errorInfos.clear()
            if (this.moduleEnv.nakoRuntime === '') {
                const runtimes = nako3plugin.getRuntimezEnvFromPlugin(this.fixer.imports, this.errorInfos)
                if (runtimes.length > 0) {
                    this.moduleEnv.nakoRuntime = runtimes[0] as NakoRuntime
                }
            }
            if (this.moduleEnv.nakoRuntime === '') {
                this.moduleEnv.nakoRuntime = nako3extensionOption.defaultNakoRuntime
            }
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.validNakoRuntime = true
            this.validApplyerFuncToken = false
        }
        this.setNakoRuntime(this.moduleEnv.nakoRuntime)
        await this.fireRefreshLink(this.fixer.imports)
        if (!this.validApplyerFuncToken) {
            this.applyer.applyFunction(this.tokens)
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.applyerFuncTokenSerialId = incSerialId(this.applyerFuncTokenSerialId)
            this.validApplyerFuncToken = true
            this.validAst = false
        }
        if (!this.validAst) {
            try {
                this.parser.parse(this.tokens)
            } catch (err) {
                console.error(err)
            }
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.astSerialId = incSerialId(this.astSerialId)
            this.validAst = true
            this.validApplyerVarToken = false
        }
        if (!this.validApplyerVarToken) {
            this.moduleEnv.fixAlllVars()
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.applyer.applyVarConst(this.tokens, this.moduleEnv.scopeIdList)
            if (canceltoken && canceltoken.isCancellationRequested) {
                return
            }
            this.applyerVarTokenSerialId = incSerialId(this.applyerVarTokenSerialId)
            this.validApplyerVarToken = true
        }
        console.info(`doc:tokenize end:${this.filename}`)
    }

    public getTokenByPosition(line: number, col: number): Token | null {
        let index = this.searchTokenByPosition(this.tokens, line, col)
        if (index !== null) {
            return this.tokens[index]
        }
        index = this.searchTokenByPosition(this.commentTokens, line, col)
        if (index !== null) {
            return this.commentTokens[index]
        }
        return null
    }

    private searchTokenByPosition(tokens: Token[], line: number, col: number): number | null {
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
