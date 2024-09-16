import { Nako3Token } from './nako3token.mjs'
import { logger } from './logger.mjs'
import type { DeclareThings, DeclareThing } from './nako3type.mjs'

type Nako3AstNode = Nako3Ast[] | Nako3Ast
export interface Nako3Ast {
    type: string;
    cond?: Nako3AstNode;
    expr?: Nako3AstNode; // todo: cond と共通化できそう
    block?: Nako3AstNode;
    target?: Nako3AstNode | null; // 反復
    errBlock?: Nako3AstNode; // todo: エラー監視の中でのみ使われる
    cases?: any[]; // 条件分岐
    operator?: string; // 演算子の場合
    left?: Nako3AstNode; // 演算子の場合
    right?: Nako3AstNode; // 演算子の場合
    false_block?: Nako3AstNode; // if
    from?: Nako3AstNode; // for
    to?: Nako3AstNode; // for
    inc?: Nako3AstNode | null | string; // for
    word?: Nako3Ast | Nako3Token | null; // for
    flagDown?: boolean; // for
    loopDirection?: null | 'up' | 'down'; // for
    name?: Nako3Token | Nako3Ast | null | string;
    names?: Nako3Ast[];
    args?: Nako3Ast[]; // 関数の引数
    asyncFn?: boolean; // 関数の定義
    isNoWait?: boolean;
    isExport?: boolean;
    meta?: any; // 関数の定義
    setter?: boolean; // 関数の定義
    index?: Nako3Ast[]; // 配列へのアクセスに利用
    josi?: string;
    value?: any;
    mode?: string; // 文字列の展開などで利用
    line: number;
    column?: number;
    file?: string;
    startOffset?: number | undefined;
    endOffset?: number | undefined;
    rawJosi?: string;
    vartype?: string;
    end?: {
        startOffset: number | undefined;
        endOffset: number | undefined;
        line?: number;
        column?: number;
    }
    tag?: string;
    genMode?: string;
    checkInit?: boolean;
    options?: { [key: string]: boolean };
}

export class NakoParserBase {
    protected stackList: any[]
    protected tokens: Nako3Token[]
    protected stack: any[]
    protected index: number
    protected y: any[]
    public modName: string
    public namespaceStack: string[]
    public modList: string[]
    public funclist: DeclareThings
    public usedFuncs: Set<string>
    protected funcLevel: number
    protected usedAsyncFn: boolean
    protected localvars: DeclareThings
    public genMode: string
    protected arrayIndexFrom: number
    protected flagReverseArrayIndex: boolean
    protected flagCheckArrayInit: boolean
    protected isReadingCalc: boolean
    protected isExportDefault: boolean
  
    constructor () {
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
      this.funclist = new Map()
      this.funcLevel = 0
      this.usedAsyncFn = false // asyncFnの呼び出しがあるかどうか
      /**
       * ローカル変数の確認用
       * @type {Object.<string,Object>}
       */
      this.localvars = new Map([['それ', { name: 'それ', type: 'var', value: '', isExport: false, isPrivate: false}]])
      /** コード生成器の名前 @type {string} */
      this.genMode = 'sync' // #637
      /** 配列のインデックスが先頭要素(#1140) @type {int} */
      this.arrayIndexFrom = 0
      /** 配列のインデックス順序を反対にするか(#1140) @type {boolean} */
      this.flagReverseArrayIndex = false
      /** 配列を自動的に初期化するか(#1140) @type {boolean} */
      this.flagCheckArrayInit = false
      // 構文解析に利用する - 現在計算式を読んでいるかどうか
      this.isReadingCalc = false
      // エクスポート設定が未設定の関数・変数に対する既定値
      this.isExportDefault = true
  
      this.init()
    }
  
    init () {
      this.funclist = new Map() // 関数の一覧
      this.reset()
    }
  
    reset () {
      this.tokens = [] // 字句解析済みのトークンの一覧を保存
      this.index = 0 // tokens[] のどこまで読んだかを管理する
      this.stack = [] // 計算用のスタック ... 直接は操作せず、pushStack() popStack() を介して使う
      this.y = [] // accept()で解析済みのトークンを配列で得るときに使う
      this.genMode = 'sync' // #637, #1056
    }
  
    setFuncList (funclist: DeclareThings) {
      this.funclist = funclist
    }
  
    /**
     * 特定の助詞を持つ要素をスタックから一つ下ろす、指定がなければ末尾を下ろす
     * @param {string[]} josiList 下ろしたい助詞の配列
     */
    popStack (josiList: string[]|undefined = undefined): Nako3Ast | null {
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
          logger.debug('POP :' + JSON.stringify(t))
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
      if (this.localvars.get(name)) {
        return {
          name,
          scope: 'local',
          info: this.localvars.get(name)
        }
      }
      // モジュール名を含んでいる?
      if (name.indexOf('__') >= 0) {
        if (this.funclist.get(name)) {
          return {
            name,
            scope: 'global',
            info: this.funclist.get(name)
          }
        } else { return undefined }
      }
      // グローバル変数（自身）？
      const gnameSelf = `${this.modName}__${name}`
      if (this.funclist.get(gnameSelf)) {
        return {
          name: gnameSelf,
          scope: 'global',
          info: this.funclist.get(gnameSelf)
        }
      }
      // グローバル変数（モジュールを検索）？
      for (const mod of this.modList) {
        const gname = `${mod}__${name}`
        const funcObj: DeclareThing|undefined = this.funclist.get(gname)
        if (funcObj && funcObj.isExport === true) {
          return {
            name: gname,
            scope: 'global',
            info: this.funclist.get(gname)
          }
        }
      }
      // システム変数 (funclistを普通に検索)
      if (this.funclist.get(name)) {
        return {
          name,
          scope: 'system',
          info: this.funclist.get(name)
        }
      }
      return undefined
    }
  
    /**
     * 計算用に要素をスタックに積む
     */
    pushStack (item: any) {
      logger.debug('PUSH:' + JSON.stringify(item))
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
    checkTypes (a: string[]): boolean {
      const type = this.tokens[this.index].type
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
        throw new Error('System Error : accept broken : ' + typeof type)
      }
      this.y = y
      return true
    }
  
    /**
     * カーソル語句を取得して、カーソルを後ろに移動する
     */
    get (): Nako3Token | null {
      if (this.isEOF()) { return null }
      return this.tokens[this.index++]
    }
  
    /** カーソル語句を取得してカーソルを進める、取得できなければエラーを出す */
    getCur (): Nako3Token {
      if (this.isEOF()) { throw new Error('トークンが取得できません。') }
      const t = this.tokens[this.index++]
      if (!t) { throw new Error('トークンが取得できません。') }
      return t
    }
  
    unget () {
      if (this.index > 0) { this.index-- }
    }
  
    /** 解析中のトークンを返す */
    peek (i = 0): Nako3Token|null {
      if (this.isEOF()) { return null }
      return this.tokens[this.index + i]
    }
  
    /** 解析中のトークンを返す、無理なら def を返す */
    peekDef (def: Nako3Token|null = null): Nako3Token {
      if (this.isEOF()) {
        if (!def) { def = {type:'?',group:'?',startLine:0,startCol:0,endLine:0,endCol:0,lineCount:0,len:0,text:'',value:'',resEndCol:0,unit:'',josi:'',indent:{level:0,len:0,text:''}} }
        return def
      }
      return this.tokens[this.index]
    }
  
    /**
     * depth: 表示する深さ
     * typeName: 先頭のtypeの表示を上書きする場合に設定する
     * @param {{ depth: number, typeName?: string }} opts
     * @param {boolean} debugMode
     */
    nodeToStr (node: Nako3Ast|Nako3Token|null, opts: {depth: number, typeName?: string}, debugMode: boolean): string {
      const depth = opts.depth - 1
      const typeName = (name: string) => (opts.typeName !== undefined) ? opts.typeName : name
      const debug = debugMode ? (' debug: ' + JSON.stringify(node, null, 2)) : ''
      if (!node) { return '(NULL)' }
      switch (node.type) {
        case 'not':
          if (depth >= 0) {
            const subNode: Nako3Ast = node.value as Nako3Ast
            return `${typeName('')}『${this.nodeToStr(subNode, { depth }, debugMode)}に演算子『not』を適用した式${debug}』`
          } else {
            return `${typeName('演算子')}『not』`
          }
        case 'op': {
          const node2: Nako3Ast = node as Nako3Ast
          let operator: string = node2.operator || ''
          const table:{[key: string]: string} = { eq: '＝', not: '!', gt: '>', lt: '<', and: 'かつ', or: 'または' }
          if (operator in table) {
            operator = table[operator]
          }
          if (depth >= 0) {
            const left: string = this.nodeToStr(node2.left as Nako3Ast, { depth }, debugMode)
            const right: string = this.nodeToStr(node2.right as Nako3Ast, { depth }, debugMode)
            if (node2.operator === 'eq') {
              return `${typeName('')}『${left}と${right}が等しいかどうかの比較${debug}』`
            }
            return `${typeName('')}『${left}と${right}に演算子『${operator}』を適用した式${debug}』`
          } else {
            return `${typeName('演算子')}『${operator}${debug}』`
          }
        }
        case 'number':
          return `${typeName('数値')}${node.value}`
        case 'bigint':
          return `${typeName('巨大整数')}${node.value}`
        case 'string':
          return `${typeName('文字列')}『${node.value}${debug}』`
        case 'word':
          return `${typeName('単語')}『${node.value}${debug}』`
        case 'func':
          return `${typeName('関数')}『${node.name || node.value}${debug}』`
        case 'eol':
          return '行の末尾'
        case 'eof':
          return 'ファイルの末尾'
        default: {
          let name:any = node.type
          if (!name) { name = node.value }
          if (typeof name !== 'string') { name = node.type }
          return `${typeName('')}『${name}${debug}』`
        }
      }
    }
  }
  