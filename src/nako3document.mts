import { CancellationToken } from 'vscode'
import { Nako3Tokenizer, TokenizeResult } from './nako3lexer.mjs'
import { ImportStatementInfo, Nako3TokenFixer } from './nako3tokenfixer.mjs'
import { Nako3Project } from './nako3project.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { Nako3TokenApplyer } from './nako3tokenapplyer.mjs'
import { NakoParser } from './nako3/nako_parser3.mjs'
import { ModuleLink, ModuleEnv, ModuleOption } from './nako3module.mjs'
import { setSerialId, incSerialId, dumpScopIdList } from './nako3util.mjs'
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
    public lengthLines: number[]
    public tokens: Token[]
    public commentTokens: Token[]
    public importStatements: ImportStatementInfo[]
    public preNakoRuntime: NakoRuntime|NakoRuntime[]
    validFixToken: boolean
    validApplyerFuncToken: boolean
    validAst: boolean
    validApplyerVarToken: boolean
    fixTokenSerialId: number
    applyerFuncTokenSerialId: number
    applyerVarTokenSerialId: number
    astSerialId: number
    link: ModuleLink
    moduleEnv: ModuleEnv
    moduleOption: ModuleOption
    project: Nako3Project|Map<string, Nako3Project>|null
    onTextUpdated: (() => void)|null
 
    constructor(filename: string, link: ModuleLink) {
        this.moduleOption = new ModuleOption()
        this.moduleEnv = new ModuleEnv(filename, link)
        this.project = null
        this.text = ''
        this.textVersion = null
        this.lexer = new Nako3Tokenizer(this.moduleEnv)
        this.fixer = new Nako3TokenFixer(this.moduleEnv, this.moduleOption)
        this.applyer = new Nako3TokenApplyer(this.moduleEnv)
        this.parser = new NakoParser(this.moduleEnv, this.moduleOption)
        this.link = link
        this.filename = filename
        this.errorInfos = new ErrorInfoManager()
        this.lengthLines = []
        this.tokens = []
        this.commentTokens = []
        this.importStatements = []
        this.preNakoRuntime = ''
        this.fixTokenSerialId = setSerialId()
        this.applyerFuncTokenSerialId = setSerialId()
        this.astSerialId = setSerialId()
        this.applyerVarTokenSerialId = setSerialId()
        this.validFixToken = false
        this.validApplyerFuncToken = false
        this.validAst = false
        this.validApplyerVarToken = false
        this.onTextUpdated =null
    }

    // called by Nako3DocumentExt only.
    updateText (text: string, textVersion: number|null): boolean {
        if (textVersion === null || textVersion !== this.textVersion) {
            this.textVersion = textVersion
            if (this.text !== text) {
                logger.info(`doc:text update:${this.filename}.`)
                this.text = text
                this.invalidate()
                if (this.onTextUpdated) {
                    this.onTextUpdated()
                }
                return true
            }
        }
        return false
    }

    invalidate(): void {
        this.validFixToken = false
        this.validApplyerFuncToken = false
        this.validAst = false
        this.validApplyerVarToken = false
    }

    public setProblemsLimit (limit: number) {
        this.errorInfos.setProblemsLimit(limit)
    }

    // 以下の４つのmethodにより解析を行う。
    // tokenize      :テキストからトークンの生成とユーザ関数と取り込み情報の抽出
    // applyFunc     :システム関数、ユーザ関数をトークン列に反映。
    // parse         :トークン列とユーザ定義関数情報から各位置のスコープの確定と変数の抽出
    // applyVarConst:変数をトークン列に反映
    // 
    // tokenizeとapplyFuncの間に以下の処置が必要
    //   取り込み情報からpluginの取り込みとpluginNamesへの反映
    // applyFuncとparseの間に以下の処置が必要
    //   なし。基本的には連続して呼び出せる
    // parseとapplyVarConstの間に以下の処置が必要
    //   変数のうちモジュールを跨るグローバル変数の確定(定義箇所を確定と参照の設定)
    //   明示的な宣言の無いローカル変数でグローバル変数にあるものを読み替え
    tokenize(canceltoken?: CancellationToken): boolean {
        console.info(`doc:tokenize start:${this.filename}`)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return false
        }
        if (this.validFixToken) {
            console.info(`doc:tokineze skip :${this.filename}`)
            return false
        }
        // tokenizerを使用してtextからrawTokens/lineLengthsを生成する
        const lexerResult = this.lexer.tokenize(this.text)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return false
        }
        this.lengthLines = lexerResult.lengthLines
        // tokenFixerを使用してrawTokenからtokens/commentTokensを生成する
        // moduleEnv.declareThingsにユーザ関数を登録し定義のあるトークンにmetaを登録する。
        const fixerResult = this.fixer.fixTokens(lexerResult.tokens)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return true
        }
        this.tokens = fixerResult.tokens
        this.commentTokens = fixerResult.commentTokens
        this.importStatements = fixerResult.imports
        this.preNakoRuntime = fixerResult.nakoRuntime
        this.fixTokenSerialId = incSerialId(this.fixTokenSerialId)
        this.validFixToken = true
        this.validApplyerFuncToken = false
        return true
    }

    applyFunc(canceltoken?: CancellationToken): boolean {
        console.info(`doc:applyFunc start:${this.filename}`)
        if (this.validApplyerFuncToken) {
            console.info(`doc:applyFunc skip :${this.filename}`)
            return false
        }                                                     
        this.applyer.applyFunction(this.tokens)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return true
        }
        this.applyerFuncTokenSerialId = incSerialId(this.applyerFuncTokenSerialId)
        this.validApplyerFuncToken = true
        this.validAst = false
        return true
    }

    parse(canceltoken?: CancellationToken): boolean {
        console.info(`doc:parse start:${this.filename}`)
        if (this.validAst) {
            console.info(`doc:parse skip :${this.filename}`)
            return false
        }                                                     
        try {
            this.parser.parse(this.tokens)
        } catch (err) {
            console.error('cause exception in parse.')
            console.error(err)
        }
        if (canceltoken && canceltoken.isCancellationRequested) {
            return true
        }
        this.astSerialId = incSerialId(this.astSerialId)
        this.validAst = true
        this.validApplyerVarToken = false
        return true
    }

    applyVarConst(canceltoken?: CancellationToken): boolean {
        console.info(`doc:applyvarConst start:${this.filename}`)
        if (this.validApplyerVarToken) {
            console.info(`doc:applyvarConst skip :${this.filename}`)
            return false
        }
            
        this.moduleEnv.fixAlllVars()
        if (canceltoken && canceltoken.isCancellationRequested) {
            return true
        }
        // dumpScopIdList (this.moduleEnv.scopeIdList, this.tokens)
        this.applyer.applyVarConst(this.tokens, this.moduleEnv.scopeIdList)
        if (canceltoken && canceltoken.isCancellationRequested) {
            return true
        }
        this.applyerVarTokenSerialId = incSerialId(this.applyerVarTokenSerialId)                                                                    
        this.validApplyerVarToken = true
        return true
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
