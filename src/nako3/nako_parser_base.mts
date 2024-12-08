import { ModuleEnv, ModuleOption } from '../nako3module.mjs'
import { ErrorInfoManager } from '../nako3errorinfo.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { nako3plugin } from '../nako3plugin.mjs'
import { logger } from '../logger.mjs'
import { NewEmptyToken, trimOkurigana } from '../nako3util.mjs'
import type { SourceMap, GlobalFunction, GlobalVarConst, LocalConstant, LocalVarConst, LocalVarConsts, LocalVariable, DeclareThings, DeclareThing, ScopeIdRange } from '../nako3types.mjs'
import type { Token, TokenType, TokenDefFunc } from '../nako3token.mjs'
import type { Ast, AstBlocks, AstOperator, AstConst, AstStrValue } from './nako_ast.mjs'

interface IndentLevel {
  level: number
  tag: string
  indentSemantic: boolean
}

/**
 * check2/check3でワイルドカードトークンとして使用する。全てのトークンにマッチする。
 */
export const CHECK_WILDCARD = 1
/**
 * なでしこの構文解析のためのユーティリティクラス
 */
export class NakoParserBase {
  protected stackList: any[]
  protected tokens: Token[]
  protected stack: any[]
  protected index: number
  protected y: any[]
  protected c: number
  public modName: string
  public namespaceStack: string[]
  public modList: string[]
  public usedFuncs: Set<string>
  protected funcLevel: number
  protected usedAsyncFn: boolean
  protected localvars: LocalVarConsts
  public genMode: string
  protected arrayIndexFrom: number
  protected flagReverseArrayIndex: boolean
  protected flagCheckArrayInit: boolean
  protected recentlyCalledFunc: GlobalFunction[]
  protected isReadingCalc: boolean
  protected isModifiedNodes: boolean
  public errorInfos: ErrorInfoManager
  protected moduleEnv: ModuleEnv
  protected moduleOption: ModuleOption
  protected currentIndentLevel: number
  protected currentIndentSemantic: boolean
  protected indentLevelStack: IndentLevel[]
  protected scopeId: string
  protected scopeIdStack: [ string, number][]
  protected scopeList: ScopeIdRange[]
  protected hasDeclareThingsUpdate: boolean

  constructor (moduleEnv: ModuleEnv, moduleOption: ModuleOption) {
    this.stackList = [] // 関数定義の際にスタックが混乱しないように整理する
    this.tokens = []
    this.usedFuncs = new Set()
    /** @type {import('./nako3.mjs').Ast[]} */
    this.stack = []
    this.index = 0
    /** トークン出現チェック(accept関数)に利用する
     * @type {import('./nako3.mjs').Ast[]}
     */
    this.y = []
    // ループ対応トークン出現チェック(check3関数)でループ回数を設定する
    this.c = 0
    /** モジュル名 @type {string} */
    this.modName = 'inline'
    this.namespaceStack = []
    /**
     * 利用するモジュールの名前一覧
     * @type {Array<string>}
     */
    this.modList = []
    /** グローバル変数・関数の確認用 */
    this.funcLevel = 0
    this.usedAsyncFn = false // asyncFnの呼び出しがあるかどうか
    /**
     * ローカル変数の確認用
     * @type {Object.<string,Object>}
     */
    this.localvars = new Map([['それ', this.genDeclareSore()]])
    /** コード生成器の名前 @type {string} */
    this.genMode = 'sync' // #637
    /** 配列のインデックスが先頭要素(#1140) @type {int} */
    this.arrayIndexFrom = 0
    /** 配列のインデックス順序を反対にするか(#1140) @type {boolean} */
    this.flagReverseArrayIndex = false
    /** 配列を自動的に初期化するか(#1140) @type {boolean} */
    this.flagCheckArrayInit = false
    /** 最近呼び出した関数(余剰エラーの報告に使う) */
    this.recentlyCalledFunc = []
    // 構文解析に利用する - 現在計算式を読んでいるかどうか
    this.isReadingCalc = false
    // エクスポート設定が未設定の関数・変数に対する既定値
    this.isModifiedNodes = false
    this.errorInfos = new ErrorInfoManager()
    this.moduleEnv = moduleEnv
    this.moduleOption = moduleOption

    // インデント構文のためのインデントレベルを管理する。
    this.currentIndentLevel = 0
    this.currentIndentSemantic = false
    this.indentLevelStack = []
    // 現在のスコープを管理する。
    // global以外はユーザ関数か無名関数の内部となる。
    this.scopeId = 'global'
    this.scopeIdStack = []
    this.scopeList = moduleEnv.scopeIdList

    this.hasDeclareThingsUpdate = false

    this.init()
  }

  setProblemsLimit (limit: number) {
    this.errorInfos.setProblemsLimit(limit)
  }

  init () {
    this.reset()
  }

  reset () {
    this.tokens = [] // 字句解析済みのトークンの一覧を保存
    this.index = 0 // tokens[] のどこまで読んだかを管理する
    this.stack = [] // 計算用のスタック ... 直接は操作せず、pushStack() popStack() を介して使う
    this.y = [] // accept()で解析済みのトークンを配列で得るときに使う
    this.currentIndentLevel = 0
    this.currentIndentSemantic = this.moduleOption.isIndentSemantic
    this.indentLevelStack = []
    this.genMode = 'sync' // #637, #1056
    this.funcLevel = 0
    this.errorInfos.clear()
    this.scopeId = 'global'                                                                                                                         
    this.scopeIdStack = []
    this.scopeList.length = 0
    this.hasDeclareThingsUpdate = false
    this.moduleEnv.allScopeVarConsts.clear()
  }

  indentPush (tag: string,):void {
    logger.debug(`indentPush: ${tag}`)
    if (this.currentIndentSemantic) {
      logger.debug(`indentPush: push indentSmentic = true`)
    }
    this.indentLevelStack.push({
      level: this.currentIndentLevel,
      tag,
      indentSemantic: this.currentIndentSemantic
    })
  }

  indentPop (tags?: string[]):void {
    logger.debug(`indentPop : ${tags?.join(',')}`)
    const indentLevel = this.indentLevelStack.pop()
    if (indentLevel) {
      if (tags) {
        if (!tags.includes(indentLevel.tag)) {
          logger.info(`indentPop:tag unmach(expect:"${tags.join('","')}" != aquire:"${indentLevel.tag}")`)
        } 
      }
      this.currentIndentLevel = indentLevel.level
      this.currentIndentSemantic = indentLevel.indentSemantic
      if (this.currentIndentSemantic) {
        logger.debug(`indentPop : change indentSmentic to true`)
      }
    } else {
      logger.info(`indentPop: stack over pop`)
      this.currentIndentLevel = 0
      this.currentIndentSemantic = this.moduleOption.isIndentSemantic
    }
  }

  // 関数定義によるスコープの出入りの際に呼び出す。
  // scopeIdがglobalならばglobalスコープ、それ以外ならばユーザ関数か無名関数の中となる。
  pushScopeId (t:TokenDefFunc, index: number): string {
    this.scopeIdStack.push([ this.scopeId, index ])
    this.scopeId = `scope-${t.meta.isMumei?this.index:t.meta.name}`
    return this.scopeId
  }

  popScopeId (): string {
    let startIndex: number
    const scopeId = this.scopeId;
    [ this.scopeId, startIndex] = this.scopeIdStack.pop() || [ 'global', 0 ]
    this.scopeList.push([ scopeId, startIndex, this.index ])
    return this.scopeId
  }

  /**
   * 特定の助詞を持つ要素をスタックから一つ下ろす、指定がなければ末尾を下ろす
   * @param {string[]} josiList 下ろしたい助詞の配列
   */
  popStack (josiList: string[]|undefined = undefined): Ast | null {
    if (!josiList) {
      const t = this.stack.pop()
      if (t) { return t }
      return null
    }

    // josiList にマッチする助詞を探す
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const t = this.stack[i]
      if (josiList.length === 0 || josiList.indexOf(t.josi) >= 0) {
        this.stack.splice(i, 1) // remove stack
        logger.log('POP :' + JSON.stringify(t))
        return t
      }
    }
    // 該当する助詞が見つからなかった場合
    return null
  }

  /**
   * saveStack と loadStack は対で使う。
   * 関数定義などでスタックが混乱しないように配慮するためのもの
   */
  saveStack () {
    this.stackList.push(this.stack)
    this.stack = []
  }

  loadStack () {
    this.stack = this.stackList.pop()
  }

  addLocalvars (vars: LocalVarConst) {
    if (vars.type === 'parameter') {
      this.localvars.set(vars.nameNormalized, Object.assign({}, vars, { type: 'var' }))
    } else {
      this.localvars.set(vars.nameNormalized, vars)
    }
    let scopedVars = this.moduleEnv.allScopeVarConsts.get(vars.scopeId)
    if (!scopedVars) {
      scopedVars = new Map()
      this.moduleEnv.allScopeVarConsts.set(vars.scopeId, scopedVars)
    }
    scopedVars.set(vars.nameNormalized, vars)
  }

  addGlobalvars (vars: GlobalVarConst, token: Token) {
    this.moduleEnv.declareThings.set(vars.nameNormalized, vars)
    this.hasDeclareThingsUpdate = true
    let globalVars = this.moduleEnv.allScopeVarConsts.get('global')
    if (!globalVars) {
      globalVars = new Map()
      this.moduleEnv.allScopeVarConsts.set('global', globalVars)
    }
    globalVars.set(vars.nameNormalized, {
      name: vars.name,
      nameNormalized: vars.nameNormalized,
      scopeId: 'global',
      type: vars.type,
      activeDeclare: vars.activeDeclare,
      range: Nako3Range.fromToken(token),
      origin: 'local'
    } as LocalVarConst)
  }

  /** 変数名を探す
   * @param {string} name
   * @returns {any}変数名の情報
   */
  findVar (name: string): any {
    // ローカル変数？
    const trimedName = trimOkurigana(name)
    const lvar = this.localvars.get(trimedName)
    if (lvar) {
      return {
        name: trimedName,
        scope: 'local',
        info: lvar
      }
    }
    // モジュール名を含んでいる?
    let gvar: DeclareThing|undefined
    if (name.indexOf('__') >= 0) {
      const index = name.lastIndexOf('__')
      const mod =  name.substring(0, index)
      const info = this.moduleEnv.externalThings.get(mod)
      if (info) {
        const funcName = trimOkurigana(name.substring(index+2))
        gvar = info.things.get(funcName)
        if (gvar && !gvar.isPrivate) {
          return {
            name: funcName,
            modName: mod,
            scope: 'global',
            info: gvar
          }
        } else { return undefined }
      } else { return undefined }
    }
    // グローバル変数（自身）？
    const gnameSelf = `${name}`
    gvar = this.moduleEnv.declareThings.get(trimedName)
    if (gvar) {
      return {
        name: trimedName,
        modName: this.modName,
        scope: 'global',
        info: gvar
      }
    }
    // グローバル変数（モジュールを検索）？
    for (const [ mod, info ] of this.moduleEnv.externalThings) {
      const thing: DeclareThing|undefined = info.things.get(trimedName)
      if (thing && thing.isExport === true) {
        return {
          name: trimedName,
          modName: mod,
          scope: 'global',
          info: thing
        }
      }
    }
    // システム変数 (nako3pluginにて検索)
    const svar = nako3plugin.getCommandInfo(name, this.moduleEnv.pluginNames, this.moduleEnv.nakoRuntime)
    if (svar) {
      return {
        name: svar.nameNormalized,
        scope: 'system',
        info: svar
      }
    }
    return undefined
  }

  /**
   * 計算用に要素をスタックに積む
   */
  pushStack (item: any) {
    logger.log('PUSH:' + JSON.stringify(item))
    this.stack.push(item)
  }

  /**
   * トークンの末尾に達したか
   */
  isEOF (): boolean {
    return (this.index >= this.tokens.length)
  }

  getIndex (): number {
    return this.index
  }

  /**
   * カーソル位置にある単語の型を確かめる
   */
  check (ttype: string): boolean {
    // logger.log(`parserbase:check:${ttype} valid index:${this.index < this.tokens.length && this.index >= 0} type:${this.index < this.tokens.length && this.index >= 0 ? this.tokens[this.index].type : 'null'}`)
    return (this.tokens[this.index].type === ttype)
  }

  /**
   * カーソル位置以降にある単語の型を確かめる 2単語以上に対応
   * @param a [単語1の型, 単語2の型, ... ]
   */
  check2 (a: any[]): boolean {
    for (let i = 0; i < a.length; i++) {
      const idx = i + this.index
      if (this.tokens.length <= idx) { return false }
      if (a[i] === CHECK_WILDCARD) { continue } // ワイルドカード(どんなタイプも許容)
      const t = this.tokens[idx]
      if (a[i] instanceof Array) {
        if (a[i].indexOf(t.type) < 0) { return false }
        continue
      }
      if (t.type !== a[i]) { return false }
    }
    return true
  }

  /**
   * カーソル位置以降にある単語の型を確かめる １つのループを含む2単語以上に対応
   * @param pre [単語1の型, 単語2の型, ... ] ループ前のトークン列
   * @param loop [単語1の型, 単語2の型, ... ] ループするトークン列
   * @param post [単語1の型, 単語2の型, ... ] ループ後のトークン列
   * @param allowLoopZero boolean ループ部分の０回を許容するならtrueを指定する。既定はfalse
   * @param loopLimit number ループ部分の回数上限を指定する。既定はMAX_VALUE
   */
  check3 (pre: any[], loop: any[], post: any[], allowLoopZero?: boolean, loopLimit?: number): boolean {
    const tmpIndex = this.index
    this.c = 0
    const fail = () => {
      this.index = tmpIndex
      return false
    }
    const success = () => {
      this.index = tmpIndex
      return true
    }
    if (!this.check2(pre)) { return fail() }
    this.index += pre.length
    if (loopLimit === undefined) { loopLimit = Number.MAX_VALUE }
    while (this.c < loopLimit && this.check2(loop)) {
      this.index += loop.length
      this.c++
    }
    if (allowLoopZero !== true && this.c === 0) { return fail() }
    if (!this.check2(post)) { return fail() }
    return success()
  }

  /**
   * カーソル位置の型を確認するが、複数の種類を確かめられる
   */
  checkTypes (a: TokenType[]): boolean {
    const type = this.tokens[this.index].type
    // logger.log(`value=${this.tokens[this.index].value} type=${type} in "${a.join('","')}"`)
    return (a.indexOf(type) >= 0)
  }

  /**
   * check2の高度なやつ、型名の他にコールバック関数を指定できる
   * 型にマッチしなければ false を返し、カーソルを巻き戻す
   */
  accept (types: any[]): boolean {
    const y = []
    const tmpIndex = this.index
    const rollback = () => {
      this.index = tmpIndex
      return false
    }
    for (let i = 0; i < types.length; i++) {
      if (this.isEOF()) { return rollback() }
      const type = types[i]
      if (type == null) { return rollback() }
      if (typeof type === 'string') {
        const token = this.get()
        if (token && token.type !== type) { return rollback() }
        y[i] = token
        continue
      }
      if (typeof type === 'function') {
        const f = type.bind(this)
        const r: any = f(y)
        if (r === null) { return rollback() }
        y[i] = r
        continue
      }
      if (type instanceof Array) {
        if (!this.checkTypes(type)) { return rollback() }
        y[i] = this.get()
        continue
      }
      logger.error('System Error : accept broken : ' + typeof type)
      this.errorInfos.addFromToken('ERROR', 'acceptBroken', { type: typeof type }, this.peekDef())
      this.skipToEof()
      return false
    }
    this.y = y
    return true
  }

  /**
   * カーソル語句を取得して、カーソルを後ろに移動する
   */
  get (): Token | null {
    // logger.log(`parserbase:get:${this.index}:valid index:${this.index < this.tokens.length && this.index >= 0} type:${this.index < this.tokens.length && this.index >= 0 ? this.tokens[this.index].type : 'null'}`)
    if (this.isEOF()) { return null }
    return this.tokens[this.index++]
  }

  /** カーソル語句を取得してカーソルを進める、取得できなければエラーを出す */
  getCur (): Token {
    if (this.isEOF()) {
       this.errorInfos.addFromToken('ERROR', 'nomoreToken', {}, this.peekDef())
       return NewEmptyToken()
    }
    const t = this.tokens[this.index++]
    if (!t) {
      this.errorInfos.addFromToken('ERROR', 'nomoreToken', {}, this.peekDef())
      return NewEmptyToken()
    }
    return t
  }

  unget () {
    if (this.index > 0) { this.index-- }
  }

  /** 解析中のトークンを返す */
  peek (i = 0): Token|null {
    if (this.isEOF()) { return null }
    return this.tokens[this.index + i]
  }

  /** 解析中のトークンを返す、無理なら def を返す */
  peekDef (def: Token|null = null): Token {
    if (this.isEOF()) {
      if (!def) { def = NewEmptyToken() }
      return def
    }
    return this.tokens[this.index]
  }

  /**
   * 現在のカーソル語句のソースコード上の位置を取得する。
   */
  peekSourceMap (t: Token | undefined = undefined): SourceMap {
    let token = (t === undefined) ? this.peek() : t
    if (token === null) {
      token = this.tokens[this.tokens.length - 1]
    }
    return { startLine: token.startLine, endLine: token.endLine, uri: token.uri, startCol: token.startCol, endCol: token.endCol, resEndCol: token.resEndCol }
  }

  rangeMerge(start: SourceMap|Token|Ast, end: SourceMap|Token|Ast): SourceMap {
    return {
      startLine: start.startLine,
      startCol: start.startCol,
      endLine: end.endLine,
      endCol: end.endCol,
      resEndCol: end.resEndCol,
      uri: start.uri
    }
  }

  fromSourceMap(start: SourceMap|Token|Ast): SourceMap {
    const end = this.peekSourceMap()
    return {
      startLine: start.startLine,
      startCol: start.startCol,
      endLine: end.endLine,
      endCol: end.endCol,
      resEndCol: end.resEndCol,
      uri: start.uri
    }
  }

  genDeclareSore(): LocalVariable {
    return { name: 'それ', nameNormalized: 'それ', type: 'var', scopeId: this.scopeId, range: null, activeDeclare: true, origin: 'system' }
  }

  getDeclareHikisu(): LocalConstant {
    return {name: '引数', nameNormalized: '引数', activeDeclare: true, type: 'const', scopeId: this.scopeId, origin: 'system', range: null, value: ''}
  }

  skipToEol ():void {
    while (!this.check('eol')) {
      const token = this.get()
      if (token === null || token.type === 'eof') {
        break
      }
    }
    logger.log(`parser:skipToEol`)
  }
 
  skipToEof ():void {
    while (!this.isEOF()) {
      const token = this.get()
      if (token === null || token.type === 'eof') {
        break
      }
    }
    logger.log(`parser:skipToEof`)
  }
 
  /**
   * depth: 表示する深さ
   * typeName: 先頭のtypeの表示を上書きする場合に設定する
   * @param {{ depth: number, typeName?: string }} opts
   * @param {boolean} debugMode
   */
  nodeToStr (node: Ast|Token|null, opts: {depth: number, typeName?: string}, debugMode: boolean): string {
    const depth = opts.depth - 1
    const typeName = (name: string) => (opts.typeName !== undefined) ? opts.typeName : name
    const debug = debugMode ? (' debug: ' + JSON.stringify(node, null, 2)) : ''
    if (!node) {
      return '(NULL)'
    }
    switch (node.type) {
      case 'not':
        if (depth >= 0) {
          const subNode: Ast = (node as AstBlocks).blocks[0] as Ast
          return `${typeName('')}『${this.nodeToStr(subNode, { depth }, debugMode)}に演算子『not』を適用した式${debug}』`
        } else {
          return `${typeName('演算子')}『not』`
        }
      case 'op': {
        const node2: AstOperator = node as AstOperator
        let operator: string = node2.operator || ''
        const table:{[key: string]: string} = { eq: '＝', not: '!', gt: '>', lt: '<', and: 'かつ', or: 'または' }
        if (operator in table) {
          operator = table[operator]
        }
        if (depth >= 0) {
          const left: string = this.nodeToStr(node2.blocks[0] as Ast, { depth }, debugMode)
          const right: string = this.nodeToStr(node2.blocks[1] as Ast, { depth }, debugMode)
          if (node2.operator === 'eq') {
            return `${typeName('')}『${left}と${right}が等しいかどうかの比較${debug}』`
          }
          return `${typeName('')}『${left}と${right}に演算子『${operator}』を適用した式${debug}』`
        } else {
          return `${typeName('演算子')}『${operator}${debug}』`
        }
      }
      case 'number':
        return `${typeName('数値')}${(node as AstConst).value}`
      case 'bigint':
        return `${typeName('巨大整数')}${(node as AstConst).value}`
      case 'string':
        return `${typeName('文字列')}『${(node as AstConst).value}${debug}』`
      case 'word':
        return `${typeName('単語')}『${(node as AstStrValue).value}${debug}』`
      case 'func':
        return `${typeName('関数')}『${node.name || (node as AstStrValue).value}${debug}』`
      case 'eol':
        return '行の末尾'
      case 'eof':
        return 'ファイルの末尾'
      default: {
        let name:any = (node as Ast).name
        if (!name) { name = (node as AstStrValue).value }
        if (typeof name !== 'string') { name = node.type }
        return `${typeName('')}『${name}${debug}』`
      }
    }
  }
}
