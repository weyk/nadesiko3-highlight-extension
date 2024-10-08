import { logger } from '../logger.mjs'
import { SourceMap, DeclareFunction, ModuleOption, LocalVariables, LocalVariable, ExternThings, DeclareThings, DeclareThing, RuntimeEnv } from '../nako3types.mjs'
import { ErrorInfoManager } from '../nako3errorinfo.mjs'
import { trimOkurigana } from '../nako3util.mjs'
import { ModuleLink } from '../nako3module.mjs'
import { Nako3Command, CommandInfo } from '../nako3command.mjs'
import { Ast, AstBlocks, AstOperator, AstConst, AstStrValue } from './nako_ast.mjs'
import { Token, TokenType, NewEmptyToken } from '../nako3token.mjs'

interface IndentLevel {
  level: number
  tag: string
}
/**
 * なでしこの構文解析のためのユーティリティクラス
 */
export class NakoParserBase {
  protected stackList: any[]
  protected tokens: Token[]
  protected stack: any[]
  protected index: number
  protected y: any[]
  public filename: string
  public modName: string
  public namespaceStack: string[]
  public modList: string[]
  public globalThings: DeclareThings
  public externThings: ExternThings
  public usedFuncs: Set<string>
  protected funcLevel: number
  protected usedAsyncFn: boolean
  protected localvars: LocalVariables
  public genMode: string
  protected arrayIndexFrom: number
  protected flagReverseArrayIndex: boolean
  protected flagCheckArrayInit: boolean
  protected recentlyCalledFunc: DeclareFunction[]
  protected isReadingCalc: boolean
  protected isModifiedNodes: boolean
  public errorInfos: ErrorInfoManager
  protected isErrorClear: boolean
  commands: Nako3Command|null
  runtimeEnv: RuntimeEnv
  pluginNames: string[]
  moduleOption: ModuleOption
  protected link: ModuleLink
  currentIndentLevel: number
  indentLevelStack: IndentLevel[]

  constructor (filename: string, moduleOption: ModuleOption, link: ModuleLink) {
    this.filename = filename
    this.link = link
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
    /** モジュル名 @type {string} */
    this.modName = 'inline'
    this.namespaceStack = []
    /**
     * 利用するモジュールの名前一覧
     * @type {Array<string>}
     */
    this.modList = []
    /** グローバル変数・関数の確認用 */
    this.globalThings = new Map()
    this.externThings = new Map()
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
    this.isErrorClear = true
    this.commands = null
    this.pluginNames = []
    this.moduleOption = moduleOption
    this.runtimeEnv = ''
    this.currentIndentLevel = 0
    this.indentLevelStack = []
    this.init()
  }

  setProblemsLimit (limit: number) {
    logger.debug(`parser3:problem limit:${limit}`)
    this.errorInfos.problemsLimit = limit
  }

  init () {
    this.globalThings = new Map() // 関数の一覧
    this.reset()
  }

  reset () {
    this.tokens = [] // 字句解析済みのトークンの一覧を保存
    this.index = 0 // tokens[] のどこまで読んだかを管理する
    this.stack = [] // 計算用のスタック ... 直接は操作せず、pushStack() popStack() を介して使う
    this.y = [] // accept()で解析済みのトークンを配列で得るときに使う
    this.currentIndentLevel = 0
    this.indentLevelStack = []
    this.genMode = 'sync' // #637, #1056
    this.isErrorClear = true
    this.errorInfos.clear()
    logger.info(`prser:clear`)
  }

  setGlobalThings (things: DeclareThings) {
    this.globalThings = things
  }

  indentPush (tag: string):void {
    this.indentLevelStack.push({
      level: this.currentIndentLevel,
      tag
    })
  }

  indentPop (tags?: string[]):void {
    const indentLevel = this.indentLevelStack.pop()
    if (indentLevel) {
      if (tags) {
        if (!tags.includes(indentLevel.tag)) {
          logger.info(`indentPop:tag unmach(expect:"${tags.join('","')}" != aquire:"${indentLevel.tag}")`)
        } 
      }
      this.currentIndentLevel = indentLevel.level
    } else {
      this.currentIndentLevel = 0
    }
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

  /** 変数名を探す
   * @param {string} name
   * @returns {any}変数名の情報
   */
  findVar (name: string): any {
    // ローカル変数？
    const lvar = this.localvars.get(name)
    if (lvar) {
      return {
        name,
        scope: 'local',
        info: lvar
      }
    }
    // モジュール名を含んでいる?
    let gvar: DeclareThing|undefined
    if (name.indexOf('__') >= 0) {
      const index = name.lastIndexOf('__')
      const mod =  name.substring(0, index)
      const things = this.externThings.get(mod)
      if (things) {
        const funcName = name.substring(index+2)
        gvar = things.get(funcName)
        if (gvar) {
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
    gvar = this.globalThings.get(name)
    if (gvar) {
      return {
        name,
        modName: this.modName,
        scope: 'global',
        info: gvar
      }
    }
    // グローバル変数（モジュールを検索）？
    for (const mod of this.modList) {
      const things: DeclareThings|undefined = this.externThings.get(mod)
      if (things) {
        const funcObj: DeclareThing|undefined = things.get(name)
        if (funcObj && funcObj.isExport === true) {
          return {
            name,
            modName: mod,
            scope: 'global',
            info: funcObj
          }
        }
      }
    }
    // システム変数 (funclistを普通に検索)
    const svar = this.getCommandInfo(name)
    if (svar) {
      return {
        name,
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
    logger.log(`parserbase:check:${ttype} valid index:${this.index < this.tokens.length && this.index >= 0} type:${this.index < this.tokens.length && this.index >= 0 ? this.tokens[this.index].type : 'null'}`)
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
      if (a[i] === '*') { continue } // ワイルドカード(どんなタイプも許容)
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
    logger.log('parserbase:accept:start')
    const y = []
    const tmpIndex = this.index
    const rollback = () => {
      this.index = tmpIndex
      logger.log('parserbase:accept:end rollback')
      return false
    }
    for (let i = 0; i < types.length; i++) {
      logger.log(`parserbase:accept:varify(${i})`)
      if (this.isEOF()) { return rollback() }
      const type = types[i]
      logger.log(`parserbase:accept:check type(${i}):${typeof type}`)
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
      throw new Error('System Error : accept broken : ' + typeof type)
    }
    this.y = y
    return true
  }

  /**
   * カーソル語句を取得して、カーソルを後ろに移動する
   */
  get (): Token | null {
    logger.log(`parserbase:get:${this.index}:valid index:${this.index < this.tokens.length && this.index >= 0} type:${this.index < this.tokens.length && this.index >= 0 ? this.tokens[this.index].type : 'null'}`)
    if (this.isEOF()) { return null }
    return this.tokens[this.index++]
  }

  /** カーソル語句を取得してカーソルを進める、取得できなければエラーを出す */
  getCur (): Token {
    if (this.isEOF()) { throw new Error('トークンが取得できません。') }
    const t = this.tokens[this.index++]
    if (!t) { throw new Error('トークンが取得できません。') }
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
    return { startLine: token.startLine, endLine: token.endLine, file: token.file, startCol: token.startCol, endCol: token.endCol, resEndCol: token.resEndCol }
  }

  rangeMerge(start: SourceMap|Token|Ast, end: SourceMap|Token|Ast): SourceMap {
    return {
      startLine: start.startLine,
      startCol: start.startCol,
      endLine: end.endLine,
      endCol: end.endCol,
      resEndCol: end.resEndCol,
      file: start.file
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
      file: start.file
    }
  }

  genDeclareSore(): LocalVariable {
    return { name: 'それ', type: 'var', value: '' }
  }

  getCommandInfo (command: string): DeclareThing|null {
    const tv = trimOkurigana(command)
    for (const key of [`runtime:${this.runtimeEnv}`, ...this.pluginNames]) {
        const commandEntry = this.commands!.get(key)
        if (commandEntry) {
            const commandInfo = commandEntry.get(command) || commandEntry.get(tv)
            if (commandInfo) {
                return commandInfo
            }
        }
    }
    return null
  }

  /**
   * depth: 表示する深さ
   * typeName: 先頭のtypeの表示を上書きする場合に設定する
   * @param {{ depth: number, typeName?: string }} opts
   * @param {boolean} debugMode
   */
  nodeToStr (node: Ast|Token|null, opts: {depth: number, typeName?: string}, debugMode: boolean): string {
    logger.log(`parserbase:nodeToStr:start`)
    const depth = opts.depth - 1
    const typeName = (name: string) => (opts.typeName !== undefined) ? opts.typeName : name
    const debug = debugMode ? (' debug: ' + JSON.stringify(node, null, 2)) : ''
    if (!node) {
      logger.log('parserbase:nodeToStr:end node is null')
      return '(NULL)'
    }
    switch (node.type) {
      case 'not':
        logger.log(`parserbase:nodeToStr:case not`)
        if (depth >= 0) {
          const subNode: Ast = (node as AstBlocks).blocks[0] as Ast
          logger.log(`parserbase:nodeToStr:end depth > 0 not`)
          return `${typeName('')}『${this.nodeToStr(subNode, { depth }, debugMode)}に演算子『not』を適用した式${debug}』`
        } else {
          logger.log(`parserbase:nodeToStr:end depth = 0 not`)
          return `${typeName('演算子')}『not』`
        }
      case 'op': {
        logger.log(`parserbase:nodeToStr:case operator`)
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
            logger.log(`parserbase:nodeToStr:end operator(eq)`)
            return `${typeName('')}『${left}と${right}が等しいかどうかの比較${debug}』`
          }
          logger.log(`parserbase:nodeToStr:end operator(${operator})`)
          return `${typeName('')}『${left}と${right}に演算子『${operator}』を適用した式${debug}』`
        } else {
          return `${typeName('演算子')}『${operator}${debug}』`
        }
      }
      case 'number':
        logger.log(`parserbase:nodeToStr:end number`)
        return `${typeName('数値')}${(node as AstConst).value}`
      case 'bigint':
        logger.log(`parserbase:nodeToStr:end bigint`)
        return `${typeName('巨大整数')}${(node as AstConst).value}`
      case 'string':
        logger.log(`parserbase:nodeToStr:end string`)
        return `${typeName('文字列')}『${(node as AstConst).value}${debug}』`
      case 'word':
        logger.log(`parserbase:nodeToStr:end word`)
        return `${typeName('単語')}『${(node as AstStrValue).value}${debug}』`
      case 'func':
        logger.log(`parserbase:nodeToStr:end function`)
        return `${typeName('関数')}『${node.name || (node as AstStrValue).value}${debug}』`
      case 'eol':
        logger.log(`parserbase:nodeToStr:end eol`)
        return '行の末尾'
      case 'eof':
        logger.log(`parserbase:nodeToStr:end eof`)
        return 'ファイルの末尾'
      default: {
        logger.log(`parserbase:nodeToStr:case other`)
        let name:any = (node as Ast).name
        if (!name) { name = (node as AstStrValue).value }
        if (typeof name !== 'string') { name = node.type }
        logger.log(`parserbase:nodeToStr:end other`)
        return `${typeName('')}『${name}${debug}』`
      }
    }
  }
}
