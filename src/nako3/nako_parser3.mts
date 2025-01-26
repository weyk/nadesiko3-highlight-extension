/**
 * nadesiko v3 parser
 */
import { Nako3Range } from '../nako3range.mjs'
import { opPriority, RenbunJosi, operatorList } from './nako_parser_const.mjs'
import { NakoParserBase, CHECK_WILDCARD } from './nako_parser_base.mjs'
import { NewEmptyToken, trimOkurigana } from '../nako3util.mjs'
import { getMessageWithArgs } from '../nako3message.mjs'
import { nako3plugin } from '../nako3plugin.mjs'
import { cssColor } from '../csscolor.mjs'
import { logger } from '../logger.mjs'
import type { GlobalFunction, SourceMap, GlobalVariable, GlobalConstant, GlobalVarConst, LocalVariable, LocalConstant } from '../nako3types.mjs'
import type { Token, TokenDefFunc, TokenCallFunc, TokenRef, TokenRefVar, StatementDef, TokenStatement, LinkDef, LinkRef, TokenLink } from '../nako3token.mjs'
import type { NodeType, Ast, AstEol, AstBlocks, AstOperator, AstConst, AstLet, AstLetArray, AstIf, AstWhile, AstAtohantei, AstFor, AstForeach, AstSwitch, AstRepeatTimes, AstDefFunc, AstCallFunc, AstStrValue, AstDefVar, AstDefVarList } from './nako_ast.mjs'
import { nako3extensionOption } from 'src/nako3option.mjs'

/**
 * 構文解析を行うクラス
 */
export class NakoParser extends NakoParserBase {
  /**
   * 構文解析を実行する
   */
  parse (tokens: Token[]): Ast {
    logger.info(`perser:parse start`)
    this.reset()
    this.tokens = tokens
    this.modName = this.moduleEnv.modName
    this.modList.push(this.modName)

    // parseの結果で変化したtypeをparseTypeにコピーする。
    for (const token of this.tokens) {
      token.type = token.funcType
    }

    logger.log(`perser:startParser call`)
    // 解析処理 - 先頭から解析開始
    const result = this.startParser()

    logger.log(`perser:startParser returned`)

    // parseの結果で変化したtypeをparseTypeにコピーする。
    for (const token of this.tokens) {
      token.parseType = token.type
    }

    if (this.hasDeclareThingsUpdate) {
      this.moduleEnv.updateAllSid()
    }

    logger.info(`perser:parse end`)
    return result
  }

  /** パーサーの一番最初に呼び出す構文規則 */
  startParser (): Ast {
    logger.log(`parser:startParser:start`)
    const b: Ast = this.ySentenceList()
    const c: Token|null = this.get()
    if (c && c.type !== 'eof') {
      logger.info(`構文解析でエラー。${this.nodeToStr(c, { depth: 1 }, true)}の使い方が間違っています。`, c)
      if (c !== null) {
        this.errorInfos.addFromToken('ERROR', 'errorParse', { nodestr: this.nodeToStr(c, { depth: 1 }, false) }, c)
      }
    }
    logger.log(`parser:startParser:end`)
    return b
  }

  /** 何もしない
   * @returns {Ast}
   */
  yNop (): Ast {
    return {
      type: 'nop',
      josi: '',
      ...this.rangeMerge(this.peekSourceMap(), this.peekSourceMap())
    }
  }

  /** 複数文を返す */
  ySentenceList(): AstBlocks {
    logger.log(`parser:sentenceList:start`)
    const blocks = []
    const map = this.peekSourceMap()
    while (!this.isEOF()) {
      logger.log(`parser:sentenceLinst:sentence call`)
      const n: Ast|null = this.ySentence()
      logger.log(`parser:sentenceLinst:sentence returned`)
      if (!n) {
        const c: Token|null = this.get()
        if (c && c.type !== 'eof') {
          logger.info(`構文解析でエラー。${this.nodeToStr(c, { depth: 1 }, true)}の使い方が間違っています。`, c)
          if (c !== null) {
            this.errorInfos.addFromToken('ERROR', 'errorParse', { nodestr: this.nodeToStr(c, { depth: 1 }, false) }, c)
          }
          this.skipToEol()
          continue
        }
        break
        }
      blocks.push(n)
    }
    if (blocks.length === 0) {
      const token = this.peek() || this.tokens[0]
      logger.debug('構文解析に失敗:' + this.nodeToStr(this.peek(), { depth: 1 }, true), token)
      this.errorInfos.addFromToken('ERROR', 'failParse', { nodestr: this.nodeToStr(this.peek(), { depth: 1 }, false) }, token)
    }

    logger.log(`parser:sentenceList:end`)
    return { type: 'block', blocks: blocks, josi: '', ...this.rangeMerge(map, this.peekSourceMap()), genMode: this.genMode }
  }

  /** 余剰スタックのレポートを作る */
  makeStackBalanceReport (): { desc: string, descFunc: string } {
    const words: string[] = []
    this.stack.forEach((t) => {
      let w = this.nodeToStr(t, { depth: 1 }, false)
      if (t.josi) { w += t.josi }
      words.push(w)
    })
    const desc = words.join(',')
    // 最近使った関数の使い方レポートを作る #1093
    let descFunc = ''
    const chA = 'A'.charCodeAt(0)
    for (const f of this.recentlyCalledFunc) {
      descFunc += ' - '
      let no = 0
      const args = (f as GlobalFunction).args
      if (args) {
        for (const arg of args) {
          const ch = String.fromCharCode(chA + no)
          descFunc += ch
          if (arg.josi.length === 1) { descFunc += arg.josi[0] } else { descFunc += `(${arg.josi.join('|')})` }
          no++
        }
      }
      descFunc += f.name + '\n'
    }
    this.recentlyCalledFunc = []
    return { desc, descFunc }
  }

  yEOL(): AstEol | null {
    // 行末のチェック #1009
    const eol = this.get()
    if (!eol) { return null }
    // 余剰スタックの確認
    if (this.stack.length > 0) {
      const reportOpts = this.makeStackBalanceReport()
      const stackTop = this.stack[0]
      this.errorInfos.addFromToken('ERROR', 'unusedWordInLineWithSuggest', reportOpts, stackTop, eol)
      this.stack.length = 0
    }
    this.recentlyCalledFunc = []
    return {
      type: 'eol',
      comment: eol.value,
      ...this.rangeMerge(eol, eol)
    }
  }

  /** @returns {Ast | null} */
  ySentence (): Ast | null {
    const map: SourceMap = this.peekSourceMap()

    // 最初の語句が決まっている構文
    if (this.check('eol')) {
      return this.yEOL()
    }
    if (this.check('もし')) {
      return this.yIF()
    }
    if (this.check('後判定')) {
      return this.yAtohantei()
    }
    if (this.check('エラー監視')) {
      return this.yTryExcept()
    }
    if (this.check('抜ける')) {
      const breakDef = this.getCur() // '抜ける'
      const statementDef : StatementDef = { type: '抜ける' };
      (breakDef as TokenStatement).statement = statementDef
      return { type: 'break', josi: '', ...this.fromSourceMap(map) }
    }
    if (this.check('続ける')) {
      const continueDef = this.getCur() // '続ける'
      const statementDef : StatementDef = { type: '続ける' };
      (continueDef as TokenStatement).statement = statementDef
      return { type: 'continue', josi: '', ...this.fromSourceMap(map) }
    }
    if (this.check('??')) {
      return this.yDebugPrint()
    }

    if (this.currentIndentSemantic) {
      if (this.check('ここまで')) {
        const token = this.get()!
        this.errorInfos.addFromToken('ERROR', 'cannnotKokomade', {}, token)
        return this.yNop()
      }
    }

    // 実行モードの指定
    if (this.check('!')) {
      return this.yPreprocessCommand()
    }
    if (this.accept(['not', 'string', 'モード設定'])) { return this.ySetGenMode(this.y[1].value) }

    // <廃止された構文>
    logger.log(`parser:sentence:deprecated mode setting group`)
    if (this.check('逐次実行')) {
      // 廃止 #1611
      return this.yTikuji()
    }
    // </廃止された構文>

    if (this.check2([['user_func', 'sys_func'], 'eq'])) {
      const word: Token = this.get() || NewEmptyToken()
      this.errorInfos.addFromToken('ERROR', 'cannnotSetToFunction', { func: word.value }, word)
      this.skipToEol()
      return this.yNop()
    }

    // 先読みして初めて確定する構文
    if (this.accept([this.ySpeedMode])) { return this.y[0] }
    if (this.accept([this.yPerformanceMonitor])) { return this.y[0] }
    if (this.accept([this.yLet])) { return this.y[0] }
    if (this.accept([this.yDefTest])) { return this.y[0] }
    if (this.accept([this.yDefFunc])) { return this.y[0] }

    // 関数呼び出しの他、各種構文の実装
    if (this.accept([this.yCall])) {
      const c1 = this.y[0]
      const nextToken = this.peek()
      if (nextToken && nextToken.type === 'ならば') {
        const map = this.peekSourceMap()
        const cond = c1
        const narabaIndex = this.getIndex()
        const naraba = this.getCur() // 'ならば'
        // もし文の条件として関数呼び出しがある場合
        return this.yIfThen(cond, naraba, [ narabaIndex, narabaIndex ], map)
      } else if (RenbunJosi.indexOf(c1.josi || '') >= 0) { // 連文をblockとして接続する(もし構文などのため)
        if (this.stack.length >= 1) { // スタックの余剰をチェック
          const reportOpts = this.makeStackBalanceReport()
          this.errorInfos.addFromToken('ERROR', 'unusedWordInLineWithSuggest', reportOpts, this.stack[0])
          this.stack.length = 0
          return this.yNop()
        }
        const c2 = this.ySentence()
        if (c2 !== null) {
          return {
            type: 'block',
            blocks: [c1, c2],
            josi: c2.josi,
            ...this.fromSourceMap(map)
          } as AstBlocks
        }
      }
      return c1
    }
    return null
  }

  /** set DNCL mode */
  yDNCLMode (ver: number): Ast {
    const map = this.peekSourceMap()
    if (ver === 1) {
      // 配列インデックスは1から
      this.arrayIndexFrom = 1
      // 配列アクセスをJSと逆順で指定する
      this.flagReverseArrayIndex = true
    } else {
      // ver2はPythonに近いとのこと
    }
    // 配列代入時自動で初期化チェックする
    this.flagCheckArrayInit = true
    return { type: 'eol', ...this.fromSourceMap(map) }
  }

  /** @returns {Ast} */
  ySetGenMode (mode: string): Ast {
    const map = this.peekSourceMap()
    this.genMode = mode
    return { type: 'eol', ...this.fromSourceMap(map) }
  }

  /** @returns {Ast} */
  yPreprocessCommand (): Ast {
    const map = this.peekSourceMap()
    while (!this.check('eol')) {
      if (this.isEOF()) {
        break
      }
      this.get()
    }
    return { type: 'eol', ...this.fromSourceMap(map) }
  }

  /** @returns {AstBlocks} */
  yBlock(): AstBlocks {
    const map = this.peekSourceMap()
    const blocks = []
    if (this.check('ここから')) { this.get() }
    while (!this.isEOF()) {
      if (this.checkTypes(['違えば', 'ここまで', 'エラー', 'エラーならば'])) { break }
      if (this.currentIndentSemantic) {
        const peektoken = this.peek()
        if (peektoken !== null && peektoken.type !== 'eol' && peektoken.indent.level <= this.currentIndentLevel) {
          break
        }
      }
      if (!this.accept([this.ySentence])) { break }
      blocks.push(this.y[0])
    }
    return { type: 'block', blocks: blocks, josi: '', ...this.fromSourceMap(map) }
  }

  yDefFuncReadArgs (): Ast[]|null {
    if (!this.check('FUNCTION_ARG_PARENTIS_START')) { return null }
    const a: Ast[] = []
    this.get() // skip '('
    while (!this.isEOF() && !this.check('eol')) {
      if (this.check('FUNCTION_ARG_PARENTIS_END')) {
        this.get() // skip ''
        break
      }
      if (this.check2([['FUNCTION_ARG_SEPARATOR','FUNCTION_ARG_ATTR_START','FUNCTION_ARG_ATTR_END','FUNCTION_ARG_ATTRIBUTE','FUNCTION_ARG_PARAMETER']])) {
        this.get() // legal tokne, skip        
      } else {
        logger.debug('関数の引数の定義でエラー。', this.get())
      }
    }
    return a
  }

  yDefTest (): Ast|null {
    return this.yDefFuncCommon('def_test')
  }

  yDefFunc (): Ast|null {
    return this.yDefFuncCommon('def_func')
  }

  /** ユーザー関数の定義
   * @returns {AstDefFunc | null}
  */
  yDefFuncCommon(type: NodeType): AstDefFunc | null {
    if (!this.check(type)) { // yDefFuncから呼ばれれば def_func なのかをチェックする
      return null
    }
    const map = this.peekSourceMap()
    // 関数定義トークンを取得(このmetaに先読みした関数の型などが入っている)
    // (ref) NakoLexer.preDefineFunc
    const defTokenIndex = this.index
    const defToken: Token|null = this.get() // 'def_func' or 'def_test'
    if (!defToken) { return null }
    const def = defToken as TokenDefFunc
    let statementCount = 1 // def_funcのトークンの分があるので1

    let isExport: boolean = def.meta.isExport
    if (this.check('FUNCTION_ATTR_PARENTIS_START')) {
      while (!this.check('eol') && !this.check('eof')) {
        if (this.check('FUNCTION_ATTR_PARENTIS_END')) {
          this.get() // skip it
          break
        }
        if (this.check('FUNCTION_ATTRIBUTE')) {
          this.get()
        } else {
          // error
          this.get()
        }
      }
    }

    let defArgs: Ast[] = []
    if (this.check('FUNCTION_ARG_PARENTIS_START')) { defArgs = this.yDefFuncReadArgs() || [] } // // lexerでも解析しているが再度詳しく

    const funcName: Token|null = this.get()
    if (!funcName || funcName.type !== 'FUNCTION_NAME') {
      logger.debug(this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, true) + 'の宣言でエラー。', funcName)
      this.errorInfos.addFromToken('ERROR', 'errorInFuncdef', { nodestr: this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, false) }, def)
    }

    if (this.check('FUNCTION_ARG_PARENTIS_START')) {
      // 関数引数の二重定義
      if (defArgs.length > 0) {
        logger.debug(this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, true) + 'の宣言で、引数定義は名前の前か後に一度だけ可能です。', funcName)
        this.errorInfos.addFromToken('ERROR', 'errorInFuncdefDupArg', { nodestr:this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, false) }, funcName || def)
      }
      defArgs = this.yDefFuncReadArgs() || []
    }

    let tohaIndex : number|undefined = undefined
    if (this.check('とは')) {
      tohaIndex = this.getIndex()
      statementCount++
      this.get()
    }
    let block: Ast = this.yNop()
    let multiline = false
    let asyncFn = false
    let indentSemantic = this.moduleOption.isIndentSemantic
    if (this.check(':')) {
      this.get()
      multiline = true
      indentSemantic = true
    }
    let kokokaraIndex : number|undefined = undefined
    if (this.check('ここから')) {
      kokokaraIndex = this.getIndex()
      this.getCur()
      statementCount++
      multiline = true
    }
    if (this.check('eol')) { multiline = true }
    let kokomadeIndex : number|undefined = undefined
    try {
      this.funcLevel++
      this.usedAsyncFn = false
      def.meta.scopeId = this.pushScopeId(def, defTokenIndex)
      // ローカル変数を生成
      const backupLocalvars = this.localvars
      this.localvars = new Map([['それ', this.genDeclareSore()]])
      this.addLocalvars(this.getDeclareHikisu())

      if (multiline) {
        this.saveStack()
        this.indentPush('関数')
        this.currentIndentLevel = def.indent.level
        this.currentIndentSemantic = indentSemantic
        // 関数の引数をローカル変数として登録する
        for (const arg of def.meta.args!) {
          if (!arg || !arg.varname) { continue }
          const fnName: string = arg.varname
          const localvar: LocalVariable = {
            name: fnName,
            nameNormalized: trimOkurigana(fnName),
            type: 'parameter',
            scopeId: this.scopeId,
            activeDeclare: true,
            range: arg.range,
            origin: 'local'
          }
          this.addLocalvars(localvar)
        }
        block = this.yBlock()
        if (this.currentIndentSemantic) {
          const level = this.peek()?.indent.level
          if (level !== undefined && level <= this.currentIndentLevel) {
          }
        } else {
          if (this.check('ここまで')) {
            kokomadeIndex = this.getIndex()
            statementCount++
            this.getCur()
          } else {
            this.errorInfos.addFromToken('ERROR', 'noKokomadeAtFunc', {}, def)
          }
        }
        this.indentPop(['関数'])
        this.loadStack()
      } else {
        this.saveStack()
        block = this.ySentence() || this.yNop()
        this.loadStack()
      }
      this.popScopeId()
      this.funcLevel--
      def.endTokenIndex = this.index
      asyncFn = this.usedAsyncFn
      this.localvars = backupLocalvars
    } catch (err: any) { 
      logger.debug(this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, true) +
        'の定義で以下のエラーがありました。\n' + err?.message, def)
      this.errorInfos.addFromToken('ERROR', 'exceptionInFuncDef', { nodestr: this.nodeToStr(funcName, { depth: 0, typeName: '関数' }, false), msg: err?.message }, def)
    }

    if (defTokenIndex) {
      const statementDef : StatementDef = { type: '関数' };
      (defToken as TokenStatement).statement = statementDef
    }
    if (statementCount > 1) {
      const linkMain : LinkDef = { childTokenIndex: [defTokenIndex]};
      (defToken as TokenLink).link = linkMain
      if (tohaIndex !== undefined) {
        linkMain.childTokenIndex.push(tohaIndex);
        (this.tokens[tohaIndex] as TokenLink).link = { mainTokenIndex: defTokenIndex }
      }
      if (kokokaraIndex !== undefined) {
        linkMain.childTokenIndex.push(kokokaraIndex);
        (this.tokens[kokokaraIndex] as TokenLink).link = { mainTokenIndex: defTokenIndex }
      }
      if (kokomadeIndex !== undefined) {
        linkMain.childTokenIndex.push(kokomadeIndex);
        (this.tokens[kokomadeIndex] as TokenLink).link = { mainTokenIndex: defTokenIndex }
      }
    }

    return {
      type,
      name: funcName?.value || 'noname',
      args: defArgs,
      blocks: [block],
      asyncFn,
      isExport,
      josi: '',
      meta: def.meta,
      ...this.fromSourceMap(map)
    }
  }

  /** 「もし」文の条件を取得 */
  yIFCond (): [ Ast, Token|null, number|undefined ] {
    const map = this.peekSourceMap()
    let a: Ast | null = this.yGetArg()
    if (!a) {
      this.errorInfos.addFromToken('ERROR', 'invalidConditionAtIf', { nodestr: this.nodeToStr(this.peek(), { depth: 1 }, false) }, map)
      a = this.yNop()
    }
    // console.log('@@yIFCond=', a)
    let narabaIndex : number | undefined = undefined
    // チェック : Aならば
    if (a.josi === 'ならば') {
      logger.error('parer:ifCond:nawaba was josi')
      return [ a, null, undefined ]
    }
    if (a.josi === 'でなければ') {
      logger.error('parer:ifCond:denakereba was josi')
      a = { type: 'not', operator: 'not', blocks:[a], josi: '', ...this.fromSourceMap(map) } as AstOperator
      return [ a, null, undefined ]
    }
    // チェック : AがBならば --- 「関数B(A)」のとき
    if ((a.josi !== '') && (this.checkTypes(['user_func', 'sys_func']))) {
      // もし文で関数呼び出しがある場合
      this.stack.push(a)
      a = this.yCall()
    } else
    // チェック : AがBならば --- 「A = B」のとき
      if (a.josi === 'が') {
        const tmpI = this.index
        let b = this.yGetArg()
        if (!b) {
          const token = this.peek()
          const nodestr = this.nodeToStr(token, { depth: 1 }, false)
          const nodestrdebug = this.nodeToStr(token, { depth: 1 }, true)
          logger.debug('もし文の条件「AがBならば」でBがないか条件が複雑過ぎます。' + nodestrdebug, map)
          this.errorInfos.addFromToken('ERROR', 'complicatedIfCond', { nodestr }, map)
          b = this.yNop()
        }
        let naraba:any = undefined
        if (b.josi === 'ならば' || b.josi === 'でなければ') {
          logger.error('parer:ifCond:nawaba/denakereba was josi')
          naraba =  { 'value': b.josi }
        } else if (this.check('ならば')) {
          narabaIndex = this.getIndex()
          naraba = this.get() || { 'value': 'ならば' }
        }
        if (naraba) {
          return [ {
            type: 'op',
            operator: (naraba.value === 'でなければ') ? 'noteq' : 'eq',
            blocks: [a, b],
            josi: '',
            ...this.fromSourceMap(map)
          } as AstOperator, naraba, narabaIndex ]
        }
        this.index = tmpI
      }
    // もし文で追加の関数呼び出しがある場合
    if (!this.check('ならば')) {
      this.stack.push(a)
      a = this.yCall()
    }
    // (ならば|でなければ)を確認
    if (!this.check('ならば')) {
      const smap: Ast = a || this.yNop()
      logger.debug(
        'もし文で『ならば』がないか、条件が複雑過ぎます。' + this.nodeToStr(this.peek(), { depth: 1 }, false) + 'の直前に『ならば』を書いてください。', smap)
        this.errorInfos.addFromToken('ERROR', 'complicatedIfCondOrNoNaraba', { nodestr: this.nodeToStr(this.peek(), { depth: 1 }, false) }, smap)
    }
    narabaIndex = this.getIndex()
    const naraba = this.get()
    // 否定形のチェック
    if (naraba && naraba.value === 'でなければ') {
      a = {
        type: 'not',
        operator: 'not',
        blocks: [a],
        josi: '',
        ...this.fromSourceMap(map)
      } as AstOperator
    }
    if (!a) {
      this.errorInfos.addFromToken('ERROR', 'invalidConditionAtIf', { nodestr: this.nodeToStr(this.peek(), { depth: 1 }, false) }, map)
      a = this.yNop()
    }
    return [ a, naraba, narabaIndex ]
  }

  /** もし文
   * @returns {AstIf | null} */
  yIF (): AstIf | null {
    const map = this.peekSourceMap()
    // 「もし」があれば「もし」文である
    if (!this.check('もし')) { return null }
    const mosiIndex = this.getIndex()
    const mosi:Token = this.getCur() // もし
    while (this.check(',')) { this.get() } // skip comma
    // 「もし」文の条件を取得
    let expr: Ast | null = null
    let naraba : Token | null = null
    let narabaIndex : number | undefined = undefined
    try {
      [ expr, naraba, narabaIndex ] = this.yIFCond()
    } catch (err: any) {
      this.errorInfos.addFromToken('ERROR', 'exceptionInIfCond', { msg: err?.message }, mosi)
      expr = this.yNop()
    }
    return this.yIfThen(expr, naraba || mosi, [ mosiIndex, narabaIndex ], map)
  }

  /** 「もし」文の「もし」以降の判定 ... 「もし」がなくても条件分岐は動くようになっている
   * @returns {AstIf | null}
  */
  yIfThen (expr: Ast, naraba: Token, linkInfo: [ number, number | undefined ], map: SourceMap): AstIf | null {
    // 「もし」文の 真偽のブロックを取得
   let trueBlock: Ast = this.yNop()
    let falseBlock: Ast = this.yNop()
    let indentSemantic = this.moduleOption.isIndentSemantic
    let hasKokomade = false
    let mainIndex = linkInfo[0]
    let narabaIndex = linkInfo[1]

    let statementCount = 1 // 代表トークンは必ずあるので初期値は1
    if (narabaIndex !== undefined && mainIndex !== narabaIndex) {
      // 代表トークンが「ならば」と別にあるなら１つカウントアップ
      statementCount++
    }

    // True Block
    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    while (this.check(',')) { this.get() } // skip comma
    if (this.check('eol')) {
      this.indentPush('ならば')
      this.currentIndentLevel = naraba.indent.level
      this.currentIndentSemantic = indentSemantic
      trueBlock = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          hasKokomade = true
        } else if (this.check('違えば')) {
          // nop
        } else {
          this.errorInfos.addFromToken('ERROR', 'noKokomadeAtIf', {}, map)
        }
      }
      this.indentPop(['ならば'])
    } else {
      const block: Ast|null = this.ySentence()
      if (block) { trueBlock = block }
    }

    // skip EOL
    while (this.check('eol')) { this.get() }

    let chigaebaIndex : number | undefined = undefined
    // False Block
    if (this.check('違えば')) {
      let indentSemantic = this.moduleOption.isIndentSemantic
      chigaebaIndex = this.getIndex()
      statementCount++
      const chigaeba = this.getCur() // skip 違えば
      if (this.check(':')) {
        this.get()
        indentSemantic = true
      }
      while (this.check(',')) { this.get() }
      if (this.check('eol')) {
        this.indentPush('違えば')
        this.currentIndentLevel = chigaeba!.indent.level
        this.currentIndentSemantic = indentSemantic
        falseBlock = this.yBlock()
        if (this.currentIndentSemantic) {
          const level = this.peek()?.indent.level
          if (level !== undefined && level <= this.currentIndentLevel) {
          }
        } else {
          if (this.check('ここまで')) {
            hasKokomade = true
          } else {
            this.errorInfos.addFromToken('ERROR', 'noKokomadeAtIf', {}, map)
          }
        }
        this.indentPop(['違えば'])
      } else {
        const block: Ast|null = this.ySentence() 
        if (block) { falseBlock = block }
      }
    }

    let kokomadeIndex : number | undefined = undefined
    if (hasKokomade) {
      if (this.check('ここまで')) {
        kokomadeIndex = this.getIndex()
        statementCount++
        this.getCur()
      }
    }

    if (mainIndex) {
      const statementDef : StatementDef = { type: 'もし' };
      (this.tokens[mainIndex] as TokenStatement).statement = statementDef
    }
    if (statementCount > 1) {
      const linkMain : LinkDef = { childTokenIndex: [mainIndex]};
      (this.tokens[mainIndex] as TokenLink).link = linkMain
      if (narabaIndex !== undefined && narabaIndex !== mainIndex) {
        linkMain.childTokenIndex.push(narabaIndex);
        (this.tokens[narabaIndex] as TokenLink).link = { mainTokenIndex: mainIndex }
      }
      if (chigaebaIndex !== undefined) {
        linkMain.childTokenIndex.push(chigaebaIndex);
        (this.tokens[chigaebaIndex] as TokenLink).link = { mainTokenIndex: mainIndex }
      }
      if (kokomadeIndex !== undefined) {
        linkMain.childTokenIndex.push(kokomadeIndex);
        (this.tokens[kokomadeIndex] as TokenLink).link = { mainTokenIndex: mainIndex }
      }
    }

    return {
      type: 'if',
      blocks: [expr, trueBlock, falseBlock],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  ySpeedMode (): AstBlocks | null {
    const map: SourceMap = this.peekSourceMap()
    if (!this.check2(['string', '実行速度優先'])) {
      return null
    }
    const optionNode: Token|null = this.get()
    const speedIndex = this.getIndex()
    const speed = this.getCur()
    let indentBase = speed
    let val = ''
    if (optionNode && optionNode.value) { val = optionNode.value } else { return null }

    const options: {[key: string]: boolean} = { 行番号無し: false, 暗黙の型変換無し: false, 強制ピュア: false, それ無効: false }
    for (const name of val.split('/')) {
      // 全て有効化
      if (name === '全て') {
        for (const k of Object.keys(options)) {
          options[k] = true
        }
        break
      }

      // 個別に有効化
      if (Object.keys(options).includes(name)) {
        options[name] = true
      } else {
        // 互換性を考えて、警告に留める。
        logger.warn(`実行速度優先文のオプション『${name}』は存在しません。`, optionNode)
        this.errorInfos.addFromToken('WARN', 'invlaidOptimizeOption', { option:name }, optionNode, speed)
      }
    }

    let indentSemantic = this.moduleOption.isIndentSemantic
    let multiline = false
    if (this.check(':')) {
      this.get()
      multiline = true
      indentSemantic = true
    }
    let kokokaraIndex: number|undefined = undefined
    if (this.check('ここから')) {
      kokokaraIndex = this.getIndex()
      indentBase = this.getCur()
      multiline = true
    } else if (this.check('eol')) {
      multiline = true
    }

    let block: Ast = this.yNop()
    if (multiline) {
      this.indentPush('実行速度優先')
      this.currentIndentLevel = indentBase.indent.level
      this.currentIndentSemantic = indentSemantic
      block = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur()
          const linkMain : LinkDef = { childTokenIndex: [speedIndex]};
          (speed as TokenLink).link = linkMain
          if (kokokaraIndex !== undefined) {
            (this.tokens[kokokaraIndex] as TokenLink).link = { mainTokenIndex: speedIndex }
            linkMain.childTokenIndex.push(kokokaraIndex)
          }
          (kokomade as TokenLink).link = { mainTokenIndex: speedIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          logger.debug(`実行速度優先の『ここまで』が省略されています。`)
          this.errorInfos.addFromToken('WARN', 'shortenedKokomadeForOptimize', {}, speed)
        }
      }
      this.indentPop(['実行速度優先'])
    } else {
      block = this.ySentence() || block
    }

    if (speed) {
      const statementDef : StatementDef = { type: '実行速度優先' };
      (speed as TokenStatement).statement = statementDef
    }

    return {
      type: 'speed_mode',
      options,
      blocks: [block],
      josi: '',
      ...map
    }
  }

  yPerformanceMonitor (): AstBlocks | null {
    const map = this.peekSourceMap()
    if (!this.check2(['string', 'パフォーマンスモニタ適用'])) {
      return null
    }
    const optionNode = this.get()
    if (!optionNode) { return null }
    const permonIndex = this.getIndex()
    const permon = this.getCur()
    let indentBase: Token = permon

    const options: {[key: string]: boolean} = { ユーザ関数: false, システム関数本体: false, システム関数: false }
    for (const name of optionNode.value.split('/')) {
      // 全て有効化
      if (name === '全て') {
        for (const k of Object.keys(options)) {
          options[k] = true
        }
        break
      }

      // 個別に有効化
      if (Object.keys(options).includes(name)) {
        options[name] = true
      } else {
        // 互換性を考えて、警告に留める。
        logger.warn(`パフォーマンスモニタ適用文のオプション『${name}』は存在しません。`, optionNode)
        this.errorInfos.addFromToken('WARN', 'invalidOptionForPerformanceMonitor', {opt: name}, optionNode)
      }
    }

    let indentSemantic = this.moduleOption.isIndentSemantic
    let multiline = false
    let kokokaraIndex: number|undefined = undefined
    if (this.check('ここから')) {
      kokokaraIndex = this.getIndex()
      indentBase = this.getCur()
      multiline = true
    } else if (this.check('eol')) {
      multiline = true
    }

    let block: Ast = this.yNop()
    if (multiline) {
      this.indentPush('パフォーマンスモニタ適用')
      this.currentIndentLevel = indentBase.indent.level
      this.currentIndentSemantic = indentSemantic
      block = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur()
          const linkMain : LinkDef = { childTokenIndex: [permonIndex]};
          (permon as TokenLink).link = linkMain
          if (kokokaraIndex !== undefined) {
            (this.tokens[kokokaraIndex] as TokenLink).link = { mainTokenIndex: permonIndex }
            linkMain.childTokenIndex.push(kokokaraIndex)
          }
          (kokomade as TokenLink).link = { mainTokenIndex: permonIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          logger.debug(`パフォーマンスモニタ適用の『ここまで』が省略されています。`)
          this.errorInfos.addFromToken('WARN', 'shortenedKokomadeForPerformanceMonitor', {}, permon)
        }
      }
      this.indentPop(['パフォーマンスモニタ適用'])
    } else {
      block = this.ySentence() || block
    }

    if (permon) {
      const statementDef : StatementDef = { type: 'パフォーマンスモニタ適用' };
      (permon as TokenStatement).statement = statementDef
    }

    return {
      type: 'performance_monitor',
      options,
      blocks: [block],
      josi: '',
      ...map
    }
  }

  /** [廃止] #1611 「逐次実行」構文 @returns {Ast | null} */
  yTikuji (): Ast|null {
    if (!this.check('逐次実行')) { return null }
    const tikuji = this.getCur() // skip
    logger.debug('『逐次実行』構文は廃止されました(https://nadesi.com/v3/doc/go.php?944)。', tikuji)
    this.errorInfos.addFromToken('ERROR', 'tikujiDeprecated', {}, tikuji)
    return { type: 'eol', ...this.peekSourceMap() }
  }

  /**
   * 1つ目の値を与え、その後に続く計算式を取得し、優先規則に沿って並び替えして戻す
   * @param {Ast} firstValue
   */
  yGetArgOperator (firstValue: Ast): Ast|null {
    const args:Ast[] = [firstValue]
    while (!this.isEOF()) {
      // 演算子がある？
      let op = this.peek()
      if (op && opPriority[op.type]) {
        op = this.getCur()
        args.push(op as any) // Token to Ast
        // 演算子後の値を取得
        const v = this.yValue()
        if (v === null) {
          this.errorInfos.addFromToken('ERROR', 'noRightOperand', { op: op.value }, firstValue)
          return this.yNop()
        }
        args.push(v)
        continue
      }
      break
    }
    if (args.length === 0) { return null }
    if (args.length === 1) { return args[0] }
    return this.infixToAST(args)
  }

  /**
   * 範囲(関数)を返す
   * @param kara 
   * @returns {AstCallFunc | null}
   */
  yRange(kara: Ast): AstCallFunc | Ast | null {
    // 範囲オブジェクト?
    if (!this.check('…')) { return null }
    const map = this.peekSourceMap()
    this.get() // skip '…'
    let made = this.yValue()
    if (!kara || !made) {
      this.errorInfos.addFromToken('ERROR', 'invalidParamInRange', {}, map)
      kara = kara || this.yNop()
      made = made || this.yNop()
    }
    const meta = nako3plugin.getDeclare('plugin_system')?.get('範囲') as GlobalFunction|undefined
    if (!meta) {
      this.errorInfos.addFromToken('ERROR', 'noCommandInSystemPlugin', { command: '範囲' }, map)
      return this.yNop()
    }
    return {
      type: 'func',
      name: '範囲',
      blocks: [kara, made],
      josi: made.josi,
      meta,
      asyncFn: false,
      ...this.fromSourceMap(map)
    }
  }

  /**
   * 表示(関数)を返す 「??」のエイリアスで利用 (#1745)
   * @returns {AstCallFunc | null}
   */
  yDebugPrint (): AstCallFunc | null {
    const map = this.peekSourceMap()
    const t = this.get() // skip '??'
    if (!t || t.value !== '??') {
      this.errorInfos.addFromToken('ERROR', 'suggestPrint', {}, map)
      this.skipToEol()
      return this.yNop() as AstCallFunc
    }
     const arg: Ast|null = this.yGetArg()
    if (!arg) {
      this.errorInfos.addFromToken('ERROR', 'suggestPrint', {}, map)
      this.skipToEol()
      return this.yNop() as AstCallFunc
    }
    const meta = nako3plugin.getDeclare('plugin_system')?.get('ハテナ関数実行') as GlobalFunction|undefined
    if (!meta) {
      this.errorInfos.addFromToken('ERROR', 'noCommandInSystemPlugin', { command: 'ハテナ関数実行' }, map)
      return this.yNop() as any
    }
    return {
      type: 'func',
      name: 'ハテナ関数実行',
      blocks: [arg],
      josi: '',
      meta,
      asyncFn: false,
      ...this.fromSourceMap(map)
    }
  }

  yGetArg (): Ast|null {
    // 値を一つ読む
    const value1 = this.yValue()
    if (value1 === null) { return null }
    // 範囲オブジェクト？
    if (this.check('…')) { return this.yRange(value1) }
    // 計算式がある場合を考慮
    return this.yGetArgOperator(value1)
  }

  infixToPolish (list: Ast[]): Ast[] {
    // 中間記法から逆ポーランドに変換
    const priority = (t: Ast) => {
      if (opPriority[t.type]) { return opPriority[t.type] }
      return 10
    }
    const stack: Ast[] = []
    const polish: Ast[] = []
    while (list.length > 0) {
      const t = list.shift()
      if (!t) { break }
      while (stack.length > 0) { // 優先順位を見て移動する
        const sTop = stack[stack.length - 1]
        if (priority(t) > priority(sTop)) { break }
        const tpop = stack.pop()
        if (!tpop) {
          logger.debug('計算式に間違いがあります。', t)
          break
        }
        polish.push(tpop)
      }
      stack.push(t)
    }
    // 残った要素を積み替える
    while (stack.length > 0) {
      const t = stack.pop()
      if (t) { polish.push(t) }
    }
    return polish
  }

  /** @returns {Ast | null} */
  infixToAST (list: Ast[]): Ast | null {
    if (list.length === 0) { return null }
    // 逆ポーランドを構文木に
    const josi = list[list.length - 1].josi
    const node = list[list.length - 1]
    const polish = this.infixToPolish(list)
    /** @type {Ast[]} */
    const stack: Ast[] = []
    for (const t of polish) {
      if (!opPriority[t.type]) { // 演算子ではない
        stack.push(t)
        continue
      }
      let b:Ast|undefined = stack.pop()
      let a:Ast|undefined = stack.pop()
      if (a === undefined || b === undefined) {
        logger.debug('--- 計算式(逆ポーランド) ---\n' + JSON.stringify(polish))
        this.errorInfos.addFromToken('ERROR', 'errorInExpression', {}, node)
        a = a || this.yNop()
        b = b || this.yNop()
      }
      /** @type {AstOperator} */
      const op: AstOperator = {
        type: 'op',
        operator: t.type,
        blocks: [a, b],
        josi,
        ...this.rangeMerge(a, b)
      }
      stack.push(op)
    }
    const ans = stack.pop()
    if (!ans) { return null }
    return ans
  }

  yGetArgParen (y: Ast[]): Ast[] { // C言語風呼び出しでカッコの中を取得
    let isClose = false
    const si = this.stack.length
    while (!this.isEOF()) {
      if (this.check(')')) {
        isClose = true
        break
      }
      const v = this.yGetArg()
      if (v) {
        this.pushStack(v)
        if (this.check(',')) { this.get() }
        continue
      }
      break
    }
    if (!isClose) {
      this.errorInfos.addFromToken('ERROR', 'requireParentisCloseInCfunction', { funaName: (y[0] as AstStrValue).value }, y[0])
    }
    const a: Ast[] = []
    while (si < this.stack.length) {
      const v = this.popStack()
      if (v) { a.unshift(v) }
    }
    return a
  }

  /** @returns {AstRepeatTimes | null} */
  yRepeatTime(): AstRepeatTimes | null {
    const map = this.peekSourceMap()
    if (!this.check('回')) { return null }
    const kaiIndex = this.getIndex()
    const kai = this.getCur() // '回'
    let indentBase = kai
    const linkMain : LinkDef = { childTokenIndex: [kaiIndex]};
    (kai as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: '回' };
    (kai as TokenStatement).statement = statementDef
    if (this.check(',')) { this.get() } // skip comma
    if (this.check('繰返')) {
      const kurikaesuIndex = this.getIndex()
      const kurikaesu = this.getCur() // 'N回、繰り返す' (#924)
      linkMain.childTokenIndex.push(kurikaesuIndex);
      (kurikaesu as TokenLink).link = { mainTokenIndex: kaiIndex }
    }
    const num = this.popStack([]) || { type: 'word', value: 'それ', josi: '', ...this.fromSourceMap(map) } as Ast
    let block: Ast = this.yNop()

    let multiline = false
    let indentSemantic = this.moduleOption.isIndentSemantic
    if (this.check(':')) {
      this.get()
      multiline = true
      indentSemantic = true
    }
    if (this.check(',')) { this.get() }
    if (this.check('ここから')) {
      multiline = true
      const kokokaraIndex = this.getIndex()
      const kokokara = this.getCur()
      linkMain.childTokenIndex.push(kokokaraIndex);
      (kokokara as TokenLink).link = { mainTokenIndex: kaiIndex }
    } else if (this.check('eol')) {
      multiline = true
    }
    if (multiline) { // multiline
      this.indentPush('回')
      this.currentIndentLevel = indentBase.indent.level
      this.currentIndentSemantic = indentSemantic
      block = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur();
          (kokomade as TokenLink).link = { mainTokenIndex: kaiIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          this.errorInfos.addFromToken('ERROR', 'noKokomadeAtForLoop', {}, map)
        }
      }
      this.indentPop(['回'])
    } else {
      // singleline
      const b = this.ySentence()
      if (b) { block = b }
    }
    return {
      type: '回',
      blocks: [num, block],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** @returns {AstWhile | null} */
  yWhile(): AstWhile | null { // 「＊の間」文
    const map = this.peekSourceMap()
    let indentSemantic = this.moduleOption.isIndentSemantic
    if (!this.check('間')) { return null }
    const aidaIndex = this.getIndex()
    let aida = this.getCur() // '間'
    let indentBase = aida
    const linkMain : LinkDef = { childTokenIndex: [aidaIndex]};
    (aida as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: '間' };
    (aida as TokenStatement).statement = statementDef
    while (this.check(',')) { this.get() } // skip ','
    if (this.check('繰返')) {
      const kurikaesuIndex = this.getIndex()
      const kurikaesu = this.getCur() // 'Nの間、繰り返す' (#927)
      linkMain.childTokenIndex.push(kurikaesuIndex);
      (kurikaesu as TokenLink).link = { mainTokenIndex: aidaIndex }
    }
    let expr = this.popStack()
    if (expr === null) {
      this.errorInfos.addFromToken('ERROR', 'noExprWhile', {}, map)
      expr = this.yNop()
    }

    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    if (this.check(',')) { this.get() }
    if (this.check('ここから')) {
      const kokokaraIndex = this.getIndex()
      const kokokara = this.getCur()
      linkMain.childTokenIndex.push(kokokaraIndex);
      (kokokara as TokenLink).link = { mainTokenIndex: aidaIndex }
    } else if (!this.check('eol')) {
      this.errorInfos.addFromToken('ERROR', 'requireLfAfterWhile', {}, map)
    }
    this.indentPush('間')
    this.currentIndentLevel = indentBase.indent.level
    this.currentIndentSemantic = indentSemantic
    const block = this.yBlock()
    if (this.currentIndentSemantic) {
      const level = this.peek()?.indent.level
      if (level !== undefined && level <= this.currentIndentLevel) {
      }
    } else {
      if (this.check('ここまで')) {
        const kokomadeIndex = this.getIndex()
        const kokomade = this.getCur();
        (kokomade as TokenLink).link = { mainTokenIndex: aidaIndex }
        linkMain.childTokenIndex.push(kokomadeIndex)
      } else {
        this.errorInfos.addFromToken('ERROR', 'noKokomadeAtWhile', {}, map)
      }
    }
    this.indentPop(['間'])
    return {
      type: 'while',
      blocks: [expr, block],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** @returns {AstAtohantei | null} */
  yAtohantei(): AstAtohantei |null {
    const map = this.peekSourceMap()
    let indentSemantic = this.moduleOption.isIndentSemantic
    let indentBase: Token|null  = null 
    if (this.check('後判定')) { indentBase = this.get() } // skip 後判定
    if (this.check('繰返')) { indentBase = this.get() } // skip 繰り返す
    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    if (this.check('ここから')) { indentBase = this.get() }
    indentBase = indentBase || this.peekDef()
    this.indentPush('後判定')
    this.currentIndentLevel = indentBase.indent.level
    this.currentIndentSemantic = indentSemantic
    const block = this.yBlock()
    if (this.currentIndentSemantic) {
      const level = this.peek()?.indent.level
      if (level !== undefined && level <= this.currentIndentLevel) {
      }
    } else {
      if (this.check('ここまで')) {
        this.get()
      } else {
        logger.debug(`後判定に『ここまで』がありません。`)
      }
    }
    this.indentPop(['後判定'])
    if (this.check(',')) { this.get() }
    let cond = this.yGetArg() // 条件
    let bUntil = false
    const t = this.peek()
    if (t && t.value === 'なる' && (t.josi === 'まで' || t.josi === 'までの')) {
      this.get() // skip なるまで
      bUntil = true
    }
    if (this.check('間')) { this.get() } // skip 間
    if (bUntil) { // 条件を反転する
      cond = {
        type: 'not',
        operator: 'not',
        blocks: [cond],
        josi: '',
        ...this.fromSourceMap(map)
      } as AstOperator
    }
    if (!cond) { cond = {type: 'number', value: 1, josi: '', ...this.fromSourceMap(map) } as AstConst }
    return {
      type: 'atohantei',
      blocks: [cond, block],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** @returns {AstFor | null} */
  yFor (): AstFor | null {
    let flagDown = true // AからBまでの時、A>=Bを許容するかどうか
    let loopDirection : null | 'up' | 'down' = null // ループの方向を一方向に限定する
    const map = this.peekSourceMap()
    if (this.check('繰返') || this.check('増繰返') || this.check('減繰返')) {
      // pass
    } else {
      return null
    }
    const kurikaesuIndex = this.getIndex()
    const kurikaesu: Token = this.getCur() // 繰り返す
    let indentBase = kurikaesu
    // スタックに(増や|減ら)してがある？
    let incdec = this.stack.pop()
    let incdecIndex: number|undefined = undefined
    if (incdec) {
      const v = trimOkurigana(incdec.value)
      if (incdec.type === 'word' && (v === '増' || v === '減')) {
        incdec.value = v
        if (v === '増') { flagDown = false }
        const w = incdec.value + kurikaesu.type
        incdecIndex = incdec.incdecIndex
        if (w == '増繰返') {
          kurikaesu.type =  '増繰返'
        } else if (w == '減繰返') {
          kurikaesu.type = '減繰返'
        } else {
          this.errorInfos.addFromToken('ERROR', 'errorInternalFor', {}, kurikaesu)
        }
      } else {
        // 普通の繰り返しの場合
        this.stack.push(incdec) // 違ったので改めて追加
        incdec = null
      }
    }
    let vInc: Ast = this.yNop()
    if (kurikaesu.type === '増繰返' || kurikaesu.type === '減繰返') {
      vInc = this.popStack(['ずつ']) || this.yNop()
      if (kurikaesu.type === '増繰返') { flagDown = false }
      loopDirection = kurikaesu.type === '増繰返' ? 'up' : 'down'
    }
    const vTo = this.popStack(['まで', 'を']) // 範囲オブジェクトの場合もあり
    const vFrom = this.popStack(['から']) || this.yNop()
    const vWord: Ast|null = this.popStack(['を', 'で'])
    let wordStr: string = ''
    if (vWord !== null) { // 変数
      if (vWord.type !== 'word') {
        this.errorInfos.addFromToken('ERROR', 'letFromToAtFor', {}, vWord)
      } else {
        wordStr = (vWord as AstStrValue).value
        const nameToken = this.getVarName(vWord)
      }
    }
    if (vFrom === null || vTo === null) {
      // 『AからBの範囲を繰り返す』構文のとき (#1704)
      if (vFrom == null && vTo && (['func','user_func','sys_func'].includes(vTo.type) && vTo.name === '範囲')) {
        // ok
      } else {
        this.errorInfos.addFromToken('ERROR', 'errorFromToAtFor', {}, kurikaesu)
      }
    }
    const linkMain : LinkDef = { childTokenIndex: [kurikaesuIndex]};
    (kurikaesu as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: '繰返' };
    (kurikaesu as TokenStatement).statement = statementDef
    if (incdec && incdecIndex !== undefined) {
      linkMain.childTokenIndex.push(incdecIndex);
      (this.tokens[incdecIndex] as TokenLink).link = { mainTokenIndex: kurikaesuIndex }
    }
    let multiline = false
    let indentSemantic = this.moduleOption.isIndentSemantic
    if (this.check(':')) {
      this.get()
      multiline = true
      indentSemantic = true
    }
    if (this.check(',')) { this.get() } // skip comma
    if (this.check('ここから')) {
      multiline = true
      const kokokaraIndex = this.getIndex()
      const kokokara = this.getCur()
      indentBase = kokokara
      linkMain.childTokenIndex.push(kokokaraIndex);
      (kokokara as TokenLink).link = { mainTokenIndex: kurikaesuIndex }
    } else if (this.check('eol')) {
      multiline = true
      this.get()
    }
    let block: Ast = this.yNop()
    if (multiline) {
      this.indentPush('繰返')
      this.currentIndentLevel = indentBase.indent.level
      this.currentIndentSemantic = indentSemantic
      block = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur();
          (kokomade as TokenLink).link = { mainTokenIndex: kurikaesuIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          this.errorInfos.addFromToken('ERROR', 'noKokomadeAtLoop', {}, map)
        }
      }
      this.indentPop(['繰返'])
    } else {
      const b = this.ySentence()
      if (b) { block = b }
    }
    
    if (!block) { block = this.yNop() }

    return {
      type: 'for',
      blocks: [vFrom, vTo || this.yNop(), vInc, block],
      flagDown,
      loopDirection,
      word: wordStr,
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** @returns {AstBlocks | null} */
  yReturn(): AstBlocks | null {
    const map = this.peekSourceMap()
    if (!this.check('戻る')) { return null }
    const returnDef = this.getCur() // skip '戻る'
    const statementDef : StatementDef = { type: '戻る' };
    (returnDef as TokenStatement).statement = statementDef
    const v = this.popStack(['で', 'を']) || this.yNop()
    if (this.stack.length > 0) {
      this.errorInfos.addFromToken('ERROR', 'returnWithMultiStack', {} , map)
      this.stack.length = 0
    }
    return {
      type: 'return',
      blocks: [v],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** @returns {AstForeach | null} */
  yForEach(): AstForeach |null {
    const map = this.peekSourceMap()
    if (!this.check('反復')) { return null }
    const hanpukuIndex = this.getIndex()
    const hanpuku = this.getCur() // '反復'
    let indentBase = hanpuku
    while (this.check(',')) { this.get() } // skip ','
    const target = this.popStack(['を']) || this.yNop()
    // target == null なら「それ」の値が使われる
    const name = this.popStack(['で'])
    let wordStr: string = ''
    if (name !== null) {
      if (name.type !== 'word') {
        this.errorInfos.addFromToken('ERROR', 'suggestForEach', {}, map)
      } else {
        wordStr = (name as AstStrValue).value
        const nameToken = this.getVarName(name)
      }
    }
    const linkMain : LinkDef = { childTokenIndex: [hanpukuIndex]};
    (hanpuku as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: '反復' };
    (hanpuku as TokenStatement).statement = statementDef
    let block: Ast = this.yNop()
    let multiline = false
    let indentSemantic = this.moduleOption.isIndentSemantic
    if (this.check(':')) {
      this.get()
      multiline = true
      indentSemantic = true
    }
    if (this.check('ここから')) {
      multiline = true
      indentBase = this.getCur()
      const kokokaraIndex = this.getIndex()
      const kokokara = this.getCur()
      linkMain.childTokenIndex.push(kokokaraIndex);
      (kokokara as TokenLink).link = { mainTokenIndex: hanpukuIndex }
    } else if (this.check('eol')) { multiline = true }

    if (multiline) {
      this.indentPush('反復')
      this.currentIndentLevel = indentBase.indent.level
      this.currentIndentSemantic = indentSemantic
      block = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur();
          (kokomade as TokenLink).link = { mainTokenIndex: hanpukuIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          this.errorInfos.addFromToken('ERROR', 'noKokomadeAtForOf', {}, map)
        }
      }
      this.indentPop(['反復'])
    } else {
      const b = this.ySentence()
      if (b) { block = b }
    }

    return {
      type: '反復',
      word: wordStr,
      blocks: [target, block],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** 条件分岐構文
   * @returns {AstSwitch | null}
   */
  ySwitch (): AstSwitch | null {
    const map = this.peekSourceMap()
    if (!this.check('条件分岐')) { return null }
    let indentSemantic = this.moduleOption.isIndentSemantic
    const joukenbunkiIndex = this.getIndex()
    const joukenbunki = this.get() // skip '条件分岐'
    if (!joukenbunki) { return null }
    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    const eol = this.get() // skip 'eol'
    if (!eol) { return null }
    let expr = this.popStack(['で'])
    if (!expr) {
      this.errorInfos.addFromToken('ERROR', 'suggestSwitch', {}, joukenbunki)
      expr = this.yNop()
    }
    if (eol.type !== 'eol') {
      this.errorInfos.addFromToken('ERROR', 'switchFollowLF', {}, joukenbunki)
    }
    //
    const blocks: Ast[] = []
    blocks[0] = expr
    blocks[1] = this.yNop() // 後で default のAstを再設定するため
    const linkMain : LinkDef = { childTokenIndex: [joukenbunkiIndex]};
    (joukenbunki as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: '条件分岐' };
    (joukenbunki as TokenStatement).statement = statementDef
    this.indentPush('条件分岐')
    this.currentIndentLevel = joukenbunki.indent.level
    this.currentIndentSemantic = indentSemantic
    //
    while (!this.isEOF()) {
      if (this.check('eol')) {
        this.get()
        continue
      }
      // ここまで？
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
          this.indentPop(['条件分岐'])
          break
        }
      } else {
        if (this.check('ここまで')) {
          this.indentPop(['条件分岐'])
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur();
          (kokomade as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
          break
        }
      }
      // 違えば？
      const condToken: Token|null = this.peek()
      if (condToken && condToken.type === '違えば') {
        let indentSemantic = this.moduleOption.isIndentSemantic
        const chigaebaIndex = this.getIndex()
        const chigaeba = this.getCur() // skip 違えば
        if (this.check(':')) {
          this.get()
          indentSemantic = true
        }
        if (this.check(',')) { this.get() } // skip ','
        linkMain.childTokenIndex.push(chigaebaIndex);
        (chigaeba as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
        this.indentPush('違えば')
        this.currentIndentLevel = chigaeba.indent.level
        this.currentIndentSemantic = indentSemantic
        const defaultBlock = this.yBlock()
        if (this.currentIndentSemantic) {
          const level = this.peek()?.indent.level
          if (level !== undefined && level <= this.currentIndentLevel) {
          }
        } else {
          if (this.check('ここまで')) {
            const kokomadeIndex = this.getIndex()
            const kokomade = this.getCur();
            (kokomade as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
            linkMain.childTokenIndex.push(kokomadeIndex)
          } else {
            logger.debug(`条件分岐-違えばに『ここまで』がありません。`)
          }
        }
        this.indentPop(['違えば'])
        while (this.check('eol')) { this.get() } // skip eol
        // 条件分岐の『違えば』の閉じるしかないので続けて検証する。
        if (this.currentIndentSemantic) {
          const level = this.peek()?.indent.level
          if (level !== undefined && level <= this.currentIndentLevel) {
          }
        } else {
          if (this.check('ここまで')) {
            const kokomadeIndex = this.getIndex()
            const kokomade = this.getCur();
            (kokomade as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
            linkMain.childTokenIndex.push(kokomadeIndex)
          } else {
            logger.debug(`条件分岐に『ここまで』がありません。`)
          }
        }
        this.indentPop(['条件分岐'])
        while (this.check('eol')) { this.get() } // skip eol
        blocks[1] = defaultBlock
        break
      }
      // 通常の条件
      let indentSemantic = this.moduleOption.isIndentSemantic
      let indentTop = this.peek()
      let cond: Ast | null = this.yValue()
      if (!cond) {
        this.errorInfos.addFromToken('ERROR', 'suggestSwitchCase', {}, joukenbunki)
        cond = this.yNop()
      }
      const narabaIndex = this.getIndex()
      const naraba = this.get() // skip ならば
      if (!naraba || naraba.type !== 'ならば') {
        this.errorInfos.addFromToken('ERROR', 'requireNarabaForSwitch', {}, joukenbunki)
        break
      } else {
        indentTop = naraba
      }
      if (this.check(':')) {
        this.get()
        indentSemantic = true
      }
      linkMain.childTokenIndex.push(narabaIndex);
      (naraba as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
      this.indentPush('ならば')
      this.currentIndentLevel = indentTop.indent.level
      this.currentIndentSemantic = indentSemantic
      if (this.check(',')) { this.get() } // skip ','
      // 条件にあったときに実行すること
      const condBlock = this.yBlock()
      if (this.currentIndentSemantic) {
        const level = this.peek()?.indent.level
        if (level !== undefined && level <= this.currentIndentLevel) {
        }
      } else {
        if (this.check('ここまで')) {
          const kokomadeIndex = this.getIndex()
          const kokomade = this.getCur();
          (kokomade as TokenLink).link = { mainTokenIndex: joukenbunkiIndex }
          linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
          logger.debug(`条件分岐-ならばに『ここまで』がありません。`)
        }
      }
      this.indentPop(['ならば'])
      blocks.push(cond)
      blocks.push(condBlock)
    }
    
    const ast: AstSwitch = {
      type: 'switch',
      blocks,
      case_count: blocks.length / 2 - 1,
      josi: '',
      ...this.fromSourceMap(map)
    }
    return ast
  }

  /** 無名関数
   * @returns {AstDefFunc|null}
  */
  yMumeiFunc (): AstDefFunc | null { // 無名関数の定義
    const map = this.peekSourceMap()
    if (!this.check('def_func')) { return null }
    const defTokenIndex = this.index
    const defToken = this.get()
    if (!defToken) { return null }
    const statementDef : StatementDef = { type: '無名関数' };
    (defToken as TokenStatement).statement = statementDef
    let indentSemantic = this.moduleOption.isIndentSemantic
    const def = defToken as TokenDefFunc
    let args: Ast[] = []
    // 「,」を飛ばす
    if (this.check(',')) { this.get() }
    // 関数の引数定義は省略できる
    if (this.check('FUNCTION_ARG_PARENTIS_START')) { args = this.yDefFuncReadArgs() || [] }
    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    // 「,」を飛ばす
    if (this.check(',')) { this.get() }
    // ブロックを読む
    this.funcLevel++
    def.meta.scopeId = this.pushScopeId(def, defTokenIndex)
    // ローカル変数を生成
    const backupLocalvars = this.localvars
    this.localvars = new Map([['それ', this.genDeclareSore()]])

    this.indentPush('には')
    this.currentIndentLevel = def.indent.level
    this.currentIndentSemantic = indentSemantic
    this.saveStack()
    // 関数の引数をローカル変数として登録する
    for (const arg of def.meta.args!) {
      if (!arg || !arg.varname) { continue }
      const fnName: string = arg.varname
      const localvar: LocalVariable = {
        name: fnName,
        nameNormalized: trimOkurigana(fnName),
        type: 'parameter',
        scopeId: this.scopeId,
        activeDeclare: true,
        range: arg.range,
        origin: 'local'
      }
      this.addLocalvars(localvar)
    }

    const block = this.yBlock()
    // 末尾の「ここまで」をチェック - もしなければエラーにする #1045
    if (this.currentIndentSemantic) {
      const level = this.peek()?.indent.level
      if (level !== undefined && level <= this.currentIndentLevel) {
      }
    } else {
      if (this.check('ここまで')) {
        const kokomadeIndex = this.getIndex()
        const kokomade = this.getCur()
        const linkMain : LinkDef = { childTokenIndex: [defTokenIndex]};
        (defToken as TokenLink).link = linkMain
        linkMain.childTokenIndex.push(kokomadeIndex);
        (kokomade as TokenLink).link = { mainTokenIndex: defTokenIndex }
      } else {
        this.errorInfos.addFromToken('ERROR', 'noKokomadeAtNiwa', {}, map)
      }
    }
    this.indentPop(['には'])
    this.loadStack()
    this.popScopeId()
    def.endTokenIndex = this.index
    this.funcLevel--
    this.localvars = backupLocalvars
    return {
      type: 'func_obj',
      name: '',
      args,
      blocks: [block],
      meta: def.meta,
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** 代入構文 */
  yDainyu (): AstBlocks | null {
    const map = this.peekSourceMap()
    const dainyu = this.get() // 代入
    if (dainyu === null) { return null }
    const value = this.popStack(['を']) || {type: 'word', value: 'それ', josi: 'を', ...map} as AstStrValue
    let word: Ast|null = this.popStack(['へ', 'に'])
    if (!word || !['word','user_func','sys_func','func','配列参照'].includes(word.type)) {
      this.errorInfos.addFromToken('ERROR', 'suggestDainyu', {}, dainyu)
      word = word || this.yNop()
    }
    // 配列への代入
    if (word.type === 'ref_array') {
      const indexArray = word.index || []
      const blocks = [value, ...indexArray]
      for (const i in indexArray) {
        (blocks[i] as TokenRef).isWrite = true
      }
      return {
        type: 'let_array',
        name: (word.name as AstStrValue).value,
        indexes: word.index,
        blocks,
        josi: '',
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }
    // 一般的な変数への代入
    const word2 = this.getVarName(word);
    (word as TokenRef).isWrite = true
    return {
      type: 'let',
      name: (word2 as AstStrValue).value,
      blocks: [value],
      josi: '',
      ...this.fromSourceMap(map)
    } as AstLet
  }

  /** 定める構文 */
  ySadameru (): AstBlocks | null {
    const map = this.peekSourceMap()
    const sadameru = this.get() // 定める
    if (sadameru === null) { return null }
    // 引数(定数名)を取得
    const word = this.popStack(['を']) || { type: 'word', value: 'それ', josi: 'を', ...this.fromSourceMap(map) } as AstStrValue
    if (!word || !['word', 'func','user_func','sys_func','配列参照'].includes(word.type)) {
      this.errorInfos.addFromToken('ERROR', 'suggestSadameru', {}, sadameru)
    }
    // 引数(値)を取得
    const value = this.popStack(['へ', 'に', 'と']) || this.yNop()
    // 公開設定
    let isExport: boolean = this.moduleOption.isExportDefault
    if (this.check2(['{', 'word', '}'])) {
      const s = this.get()
      if (s) {
        s.type = 'VARIABLE_ATTR_PARENTIS_START'
      }
      const attrNode = this.get()
      if (attrNode === null) {
        this.errorInfos.addFromToken('ERROR', 'errorSadameruAttr', { name: (word as AstStrValue).value }, word)
      } else {
        attrNode.type = 'VARIABLE_ATTRIBUTE'
        const attr = attrNode.value
        if (attr === '公開') { isExport = true } else if (attr === '非公開') { isExport = false } else if (attr === 'エクスポート') { isExport = true } else { logger.warn(`不明な変数属性『${attr}』が指定されています。`) }
      }
      const e = this.get()
      if (e) {
        e.type = 'VARIABLE_ATTR_PARENTIS_END'
      }
    }
    (word as TokenRef).isWrite = true
    // 変数を生成する
    const nameToken = this.createVar(word as AstStrValue, true, isExport, true)
    // 定数で内容が文字列１つのみの場合に色コードチェックをしてマークする
    this.markColor(word, value)
    return {
      type: 'def_local_var',
      name: (nameToken as AstStrValue).value,
      vartype: '定数',
      isExport,
      blocks: [value],
      josi: '',
      ...map,
      end: this.peekSourceMap()
    } as AstDefVar
  }

  yIncDec (): AstBlocks | null {
    const map = this.peekSourceMap()
    const actionIndex = this.getIndex()
    const action = this.get() // (増やす|減らす)
    if (action === null) { return null }

    // 『Nずつ増やして繰り返す』文か？
    if (this.check('繰返')) {
      this.pushStack({ type: 'word', value: action.value, josi: action.josi, incdecIndex: actionIndex, ...this.fromSourceMap(map) })
      return this.yFor()
    }

    // スタックから引数をポップ
    let value = this.popStack(['だけ', ''])
    if (!value) {
      value = { type: 'number', value: 1, josi: 'だけ', ...this.fromSourceMap(map) } as AstConst
    }
    const word = this.popStack(['を'])
    if (!word || (word.type !== 'word' && word.type !== 'ref_array')) {
      this.errorInfos.addFromToken('ERROR', 'suggestIncDec', { type: action.type }, action)
    }

    // 減らすなら-1かける
    if (action.value === '減') {
      const minus_one = { type: 'number', value: -1, ...map } as AstConst
      value = { type: 'op', operator: '*', blocks: [value, minus_one], josi: '', ...map } as AstOperator
    }

    if (word) {
      if (word.type === 'ref_array') {
        const indexArray = word.index
        if (indexArray) {
          for (let i in indexArray) {
            (this.tokens[i] as TokenRef).isWrite = true
          }
        }
      } else if (word.type === 'word') {
        (word as TokenRef).isWrite = true
      }
    }
    return {
      type: 'inc',
      name: word,
      blocks: [value],
      josi: action.josi,
      ...this.fromSourceMap(map)
    }
  }

  yCall (): Ast | null {
    if (this.isEOF()) { return null }

    // スタックに積んでいく
    while (!this.isEOF()) {
      if (this.check('ここから')) { this.get() }
      // 代入
      if (this.check('代入')) { return this.yDainyu() }
      if (this.check('定める')) { return this.ySadameru() }
      // 制御構文
      if (this.check('回')) { return this.yRepeatTime() }
      if (this.check('間')) { return this.yWhile() }
      if (this.check('繰返') || this.check('増繰返') || this.check('減繰返')) { return this.yFor() }
      if (this.check('反復')) { return this.yForEach() }
      if (this.check('条件分岐')) { return this.ySwitch() }
      if (this.check('戻る')) { return this.yReturn() }
      if (this.check('増') || this.check('減')) { return this.yIncDec() }
      // C言語風関数
      if (this.check2([['func', 'user_func', 'sys_func', 'word'], '('])) { // C言語風
        const cur = this.peek()
        if (cur && cur.josi === '') {
          const t: Ast|null = this.yValue() // yValueにてC言語風呼び出しをパース
          if (t) {
            const josi = t.josi || ''
            if (['func','user_func','sys_func'].includes(t.type) && (t.josi === '' || RenbunJosi.indexOf(josi) >= 0)) {
              t.josi = ''
              return t // 関数なら値とする
            }
            this.pushStack(t)
          }
          if (this.check(',')) { this.get() }
          continue
        }
      }
      // なでしこ式関数
      if (this.checkTypes(['user_func', 'sys_func'])) {
        const r = this.yCallFunc()
        if (r === null) { continue }
        // 「〜する間」の形ならスタックに積む。
        if (this.check('間')) {
          this.pushStack(r)
          continue
        }
        // 関数呼び出しの直後に、四則演算があるか?
        if (!this.checkTypes(operatorList)) {
          return r // 関数呼び出しの後に演算子がないのでそのまま関数呼び出しを戻す
        }
        // 四則演算があった場合、計算してスタックに載せる
        const s = this.yGetArgOperator(r)
        this.pushStack(s)
        continue
      }
      // 値のとき → スタックに載せる
      const t = this.yGetArg()
      if (t) {
        this.pushStack(t)
        continue
      }
      break
    } // end of while

    // 助詞が余ってしまった場合
    if (this.stack.length > 0) {
      if (this.isReadingCalc) {
        return this.popStack()
      }
      logger.debug('--- stack dump ---\n' + JSON.stringify(this.stack, null, 2) + '\npeek: ' + JSON.stringify(this.peek(), null, 2))
      const nodestrs = this.stack.map((n) => this.nodeToStr(n, { depth: 0 }, false)).join('、')
      let msgDebug = `不完全な文です。${this.stack.map((n) => this.nodeToStr(n, { depth: 0 }, true)).join('、')}が解決していません。`
      let msg = getMessageWithArgs('remainStack', { nodestrs })
      // let msg = `不完全な文です。${nodestrs}が解決していません。`
      // 各ノードについて、更に詳細な情報があるなら表示
      for (const n of this.stack) {
        const d0 = this.nodeToStr(n, { depth: 0 }, false)
        const d1 = this.nodeToStr(n, { depth: 1 }, false)
        if (d0 !== d1) {
          msgDebug += `${this.nodeToStr(n, { depth: 0 }, true)}は${this.nodeToStr(n, { depth: 1 }, true)}として使われています。`
          msg += getMessageWithArgs('usedBy', { d0, d1 })
          // msg += `${d0}は${d1}として使われています。`
        }
      }

      const first = this.stack[0]
      const last = this.stack[this.stack.length - 1]
      logger.debug(msgDebug, first)
      this.errorInfos.addRawFromToken('ERROR', msg, first, last)
      this.stack.length = 0
      this.stack.push(this.yNop())
    }
    return this.popStack([])
  }

  /** @returns {Ast | null} */
  yCallFunc (): Ast | null {
    const map = this.peekSourceMap()
    const callToken = this.get()
    if (!callToken) { return null }
    const t = callToken as TokenCallFunc
    const f = t.meta
    const funcName: string = t.value
    // (関数)には ... 構文 ... https://github.com/kujirahand/nadesiko3/issues/66
    let funcObj = null
    const nextToken = this.peek()
    if (nextToken && this.check('def_func') && nextToken.value === 'には') {
      try {
        funcObj = this.yMumeiFunc()
      } catch (err: any) {
        this.errorInfos.addFromToken('ERROR', 'errorInMumeiFunc', { func: t.value, message: err.message}, t)
        return null
      }
      if (funcObj === null) {
        this.errorInfos.addFromToken('ERROR', 'notFoundDefFunction', {}, t)
        return null
      }
    }
    if (!f || typeof f.args === 'undefined') {
      this.errorInfos.addFromToken('ERROR', 'ErrorInDeclareFunction', { name: t.value, metaIsNull:t.meta == null ? 1 : 0 }, t)
      return null
    }

    // 最近使った関数を記録
    this.recentlyCalledFunc.push({ ...f, name: funcName })

    // 呼び出す関数が非同期呼び出しが必要(asyncFn)ならマーク
    if (f && f.isAsync) { this.usedAsyncFn = true }

    // 関数の引数を取り出す処理
    const args: any[] = []
    let nullCount = 0
    let valueCount = 0
    for (let i = f.args.length - 1; i >= 0; i--) {
      const arg = f.args[i]
      for (;;) {
        // スタックから任意の助詞を持つ値を一つ取り出す、助詞がなければ末尾から得る
        let popArg = this.popStack(arg.josi)
        if (popArg !== null) {
          valueCount++
        } else if (i < f.args.length - 1 || !f.isVariableJosi) {
          nullCount++
          popArg = funcObj
        } else {
          break
        }
        // 参照渡しの場合、引数が関数の参照渡しに該当する場合、typeを『func_pointer』に変更
        if (popArg !== null && arg.attr.includes('func_pointer')) {
          if (['func','user_func','sys_func'].includes(popArg.type)) { // 引数が関数の参照渡しに該当する場合
            (popArg as TokenCallFunc).isFuncPointer = true
          } else {
            const varname = arg.varname !== '' ? arg.varname :  getMessageWithArgs('funcArgN', { n: i + 1 })
            this.errorInfos.addFromToken('ERROR', 'paramRequireFuncObj', { func: t.value, varname }, t)
          }
        }
        // 引数がnullであれば、自動的に『変数「それ」』で補完する
        if (popArg === null) {
          popArg = { type: 'word', value: 'それ', josi: '', ...map } as AstStrValue
        }
        args.unshift(popArg) // 先頭に追加
        if (i < f.args.length - 1 || !f.isVariableJosi) { break }
      }
    }
    // 引数が不足しているとき(つまり、引数にnullがあるとき)、自動的に『変数「それ」』で補完される。
    // ただし、nullが1つだけなら、変数「それ」で補完されるが、2つ以上あるときは、エラーにする
    if (nullCount >= 2 && (valueCount > 0 || t.josi === '' || RenbunJosi.indexOf(t.josi) >= 0)) {
      this.errorInfos.addFromToken('ERROR', 'notEnogthArgs', { func: t.value }, t)
    }
    this.usedFuncs.add(t.value)
    // 関数呼び出しのAstを構築
    const funcNode: AstCallFunc = {
      type: 'func',
      name: t.value,
      blocks: args,
      meta: f,
      josi: t.josi,
      asyncFn: f.isAsync ? true : false,
      ...this.fromSourceMap(map)
    }

    // 言い切りならそこで一度切る
    if (t.josi === '') { return funcNode }

    // 「**して、**」の場合も一度切る
    if (RenbunJosi.indexOf(t.josi) >= 0) {
      funcNode.josi = 'して'
      return funcNode
    }
    // 続き
    funcNode.meta = f
    this.pushStack(funcNode)
    return null
  }

  /** @returns {Ast | null} */
  yLet (): AstBlocks | null {
    const map = this.peekSourceMap()
    // 通常の変数
    if (this.check2(['word', 'eq'])) {
      const word = this.peek()
      let threw = false
      try {
        if (this.accept(['word', 'eq', this.yCalc]) || this.accept(['word', 'eq', this.ySentence])) {
          let valueToken = this.y[2]
          if (valueToken.type === 'eol') {
            this.errorInfos.addFromToken('ERROR', 'valueIsEmpty', {}, map, valueToken)
            valueToken = this.yNop()
          }
          if (this.check(',')) { this.get() } // skip comma (ex) name1=val1, name2=val2
          const nameToken = this.getVarName(this.y[0]);
          (nameToken as TokenRef).isWrite = true
          return {
            type: 'let',
            name: (nameToken as AstStrValue).value,
            blocks: [valueToken],
            josi: '',
            ...this.fromSourceMap(map)
          } as AstLet
        } else {
          threw = true
          logger.debug(`${this.nodeToStr(word, { depth: 1 }, true)}への代入文で計算式に書き間違いがあります。`, word)
          this.errorInfos.addFromToken('ERROR', 'invalidLet', { nodestr: this.nodeToStr(word, { depth: 1 }, false)}, map)
          this.skipToEol()
        }
      } catch (err: any) {
        if (!threw) {
          logger.debug(`${this.nodeToStr(word, { depth: 1 }, true)}への代入文で計算式に以下の書き間違いがあります。\n${err.message}`, word)
          this.errorInfos.addFromToken('ERROR', 'invalidLetWithMessage', { nodestr: this.nodeToStr(word, { depth: 1 }, false), msg: err.message }, map)
          this.skipToEol()
        }
      }
    }

    // オブジェクトプロパティ構文 代入文 (#1793)
    if (this.check3(['word'], ['$', ['word', 'string', 'sys_func', 'user_func']], ['eq'], false, 3)) {
      const propList = []
      const word = this.getVarName(this.get() as Token)
      for (;;) {
        const flag = this.peek()
        if (flag === null || flag.type !== '$') { break }
        this.get() // skip $
        const propToken = this.get() as Token
        if (propToken.type === 'word') {
          propToken.type = 'string'
        } else if (propToken.type ===  'sys_func' || propToken.type === 'user_func') {
          delete (propToken as any).meta
          propToken.type = 'string'
        }
        propList.push(propToken as Ast) // property
      }
      this.get() // skip eq
      const valueToken = this.yCalc() // calc
      if (valueToken === null) {
        this.errorInfos.addFromToken('ERROR', 'invalidLet', { noestr: this.nodeToStr(word, { depth: 1 }, false) }, word)
        this.skipToEol()
        return this.yNop() as any
      }
      (word as TokenRef).isWrite = true
      return {
        type: 'let_prop',
        name: (word as AstStrValue).value,
        index: propList,
        blocks: [valueToken],
        josi: '',
        ...map,
        end: this.peekSourceMap()
      } as AstLet
    }
    // オブジェクトプロパティ構文 ここまで
    
    // let_array ?
    if (this.check2(['word', '@'])) {
      const la = this.yLetArrayAt(map)
      if (this.check(',')) { this.get() } // skip comma (ex) name1=val1, name2=val2
      if (la) {
        la.checkInit = this.flagCheckArrayInit
        return la
      }
    }
    if (this.check2(['word', '['])) {
      const lb = this.yLetArrayBracket(map) as AstLetArray
      if (this.check(',')) { this.get() } // skip comma (ex) name1=val1, name2=val2
      if (lb) {
        lb.checkInit = this.flagCheckArrayInit
        return lb
      }
    }

    // ローカル変数定義
    if (this.accept(['word', 'とは'])) {
      const wordToken = this.y[0]
      if (!this.checkTypes(['変数', '定数'])) {
        this.errorInfos.addFromToken('ERROR', 'errorDeclareLocalVars', { varname: wordToken.value }, wordToken)
      }
      const vtype = this.getCur() // 変数 or 定数
      let isExport : boolean = this.moduleOption.isExportDefault
      if (this.check2(['{', 'word', '}'])) {
        const s = this.get()
        if (s) {
          s.type = 'VARIABLE_ATTR_PARENTIS_START'
        }
        const attrNode = this.get()
        if (attrNode === null) {
          this.errorInfos.addFromToken('ERROR', 'errorDeclareLocalVars', { varname: wordToken.value }, wordToken)
        } else {
          const attr = attrNode.value
          attrNode.type = 'VARIABLE_ATTRIBUTE'
          if (attr === '公開') { isExport = true } else if (attr === '非公開') { isExport = false } else if (attr === 'エクスポート') { isExport = true } else { logger.warn(`不明な変数属性『${attr}』が指定されています。`) }
        }
        const e = this.get()
        if (e) {
          e.type = 'VARIABLE_ATTR_PARENTIS_END'
        }
      }
      const word = this.createVar(wordToken, vtype.type === '定数', isExport, true)
      // 初期値がある？
      let value = this.yNop()
      if (this.check('eq')) {
        this.get() // skip '='
        value = this.yCalc() || value
      }
      if (this.check(',')) { this.get() } // skip comma (ex) name1=val1, name2=val2
      if (this.funcLevel === 0) {
        if (vtype.type === '定数') {
          const decvar: GlobalConstant = {
            name: (word as AstStrValue).value,
            nameNormalized: trimOkurigana((word as AstStrValue).value),
            modName: this.modName,
            uri: this.moduleEnv.uri,
            type: 'const',
            isExport,
            isPrivate: false,
            range: Nako3Range.fromToken(wordToken),
            origin: 'global',
            isRemote: this.moduleEnv.isRemote,
            activeDeclare: true,
            value: ''
          }
          this.addGlobalvars(decvar, wordToken)
        } else {
          const decvar: GlobalVariable = {
            name: (word as AstStrValue).value,
            nameNormalized: trimOkurigana((word as AstStrValue).value),
            modName: this.modName,
            uri: this.moduleEnv.uri,
            type: 'var',
            isExport,
            isPrivate: false,
            range: Nako3Range.fromToken(wordToken),
            origin: 'global',
            isRemote: this.moduleEnv.isRemote,
            activeDeclare: true
          }
          this.addGlobalvars(decvar, wordToken)
        }
      }
      if (vtype.type === '定数') {
        this.markColor(word, value)
      }
      return {
        type: 'def_local_var',
        name: (word as AstStrValue).value,
        vartype: vtype.type,
        isExport,
        blocks: [value],
        ...this.fromSourceMap(map)
      } as AstDefVar
    }
    // ローカル変数定義（その２）
    if (this.accept(['変数', 'word'])) {
      const wordVar = this.y[1]
      this.index -= 2 // 「変数 word」の前に巻き戻す
      // 変数の宣言および初期化1
      if (this.accept(['変数', 'word', 'eq', this.yCalc])) {
        const word = this.createVar(this.y[1], false, this.moduleOption.isExportDefault, true)
        const astValue = this.y[3] || this.yNop();
        (this.y[1] as TokenRef).isWrite = true
        return {
          type: 'def_local_var',
          name: (word as AstStrValue).value,
          vartype: '変数',
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVar
      }

      // 変数の宣言および初期化2
      if (this.accept(['変数', 'word', '{', 'word', '}', 'eq', this.yCalc])) {
        let isExport: boolean = this.moduleOption.isExportDefault
        this.y[2].type = 'VARIABLE_ATTR_PARENTIS_START'
        this.y[3].type = 'VARIABLE_ATTRIBUTE'
        this.y[4].type = 'VARIABLE_ATTR_PARENTIS_END'
        const attr = this.y[3].value
        if (attr === '公開') { isExport = true } else if (attr === '非公開') { isExport = false } else if (attr === 'エクスポート') { isExport = true } else { logger.warn(`不明な変数属性『${attr}』が指定されています。`) }
        const word = this.createVar(this.y[1], false, isExport, true)
        const astValue = this.y[6] || this.yNop();
        (this.y[1] as TokenRef).isWrite = true
        return {
          type: 'def_local_var',
          name: (word as AstStrValue).value,
          vartype: '変数',
          isExport,
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVar
      }

      // 変数宣言のみの場合
      {
        this.index += 2 // 変数 word を読んだとする
        const word = this.createVar(wordVar, false, this.moduleOption.isExportDefault, true)
        return {
          type: 'def_local_var',
          name: (word as AstStrValue).value,
          vartype: '変数',
          blocks: [this.yNop()],
          ...this.fromSourceMap(map)
        } as AstDefVar
      }
    }

    if (this.accept(['定数', 'word', 'eq', this.yCalc])) {
      const word = this.createVar(this.y[1], true, this.moduleOption.isExportDefault, true)
      const astValue = this.y[3] || this.yNop();
      (this.y[1] as TokenRef).isWrite = true
      this.markColor(this.y[1], astValue)
      return {
        type: 'def_local_var',
        name: (word as AstStrValue).value,
        vartype: '定数',
        blocks: [astValue],
        ...this.fromSourceMap(map)
      } as AstDefVar
    }

    if (this.accept(['定数', 'word', '{', 'word', '}', 'eq', this.yCalc])) {
      let isExport : boolean = this.moduleOption.isExportDefault
      this.y[2].type = 'VARIABLE_ATTR_PARENTIS_START'
      this.y[3].type = 'VARIABLE_ATTRIBUTE'
      this.y[4].type = 'VARIABLE_ATTR_PARENTIS_END'
      const attr = this.y[3].value
      if (attr === '公開') { isExport = true } else if (attr === '非公開') { isExport = false } else if (attr === 'エクスポート') { isExport = true } else { logger.warn(`不明な定数属性『${attr}』が指定されています。`) }
      const word = this.createVar(this.y[1], true, isExport, true)
      const astValue = this.y[6] || this.yNop();
      (this.y[1] as TokenRef).isWrite = true
      this.markColor(this.y[1], astValue)
      return {
        type: 'def_local_var',
        name: (word as AstStrValue).value,
        vartype: '定数',
        isExport,
        blocks: [astValue],
        ...this.fromSourceMap(map)
      } as AstDefVar
    }

    // 複数定数への代入 #563
    if (this.accept(['定数', this.yJSONArray, 'eq', this.yCalc])) {
      const names = this.y[1]
      // check array
      if (names && names.blocks instanceof Array) {
        for (const i in names.blocks) {
          if (names.blocks[i].type !== 'word') {
            this.errorInfos.addFromToken('ERROR', 'suggestMultipleLetConstInNth', { n: i + 1 }, this.y[0])
          }
        }
      } else {
        this.errorInfos.addFromToken('ERROR', 'suggestMultipleLetConst', {}, this.y[0])
      }
      const namesAst = this._tokensToNodes(this.createVarList(names.blocks, true, this.moduleOption.isExportDefault))
      const astValue = this.y[3] || this.yNop()
      for (const i in names.blocks) {
        (names.blocks[i] as TokenRef).isWrite = true
      }
      return {
        type: 'def_local_varlist',
        names: namesAst,
        vartype: '定数',
        blocks: [astValue],
        ...this.fromSourceMap(map)
      } as AstDefVarList
    }
    // 複数変数への代入 #563
    if (this.accept(['変数', this.yJSONArray, 'eq', this.yCalc])) {
      const names: AstBlocks = this.y[1]
      // check array
      if (names && names.blocks instanceof Array) {
        for (const i in names.blocks) {
          if (names.blocks[i].type !== 'word') {
            this.errorInfos.addFromToken('ERROR', 'suggestMultipleLetVarInNth', { n: i + 1 }, this.y[0])
          }
        }
      } else {
        this.errorInfos.addFromToken('ERROR', 'suggestMultipleLetVar', {}, this.y[0])
      }
      const namesAst = this._tokensToNodes(this.createVarList(names.blocks as Token[], false, this.moduleOption.isExportDefault))
      const astValue = this.y[3] || this.yNop()
      for (const i in names.blocks) {
        (names.blocks[i] as TokenRef).isWrite = true
      }
      return {
        type: 'def_local_varlist',
        names: namesAst,
        vartype: '変数',
        blocks: [astValue],
        ...this.fromSourceMap(map)
      } as AstDefVarList
    }

    // 複数変数への代入 #563
    if (this.check2(['word', ',', 'word'])) {
      // 2 word
      if (this.accept(['word', ',', 'word', 'eq', this.yCalc])) {
        let names = [this.y[0], this.y[2]]
        names = this.createVarList(names, false, this.moduleOption.isExportDefault)
        const astValue = this.y[4] || this.yNop()
        for (const i in names) {
          (names[i] as TokenRef).isWrite = true
        }
        return {
          type: 'def_local_varlist',
          names,
          vartype: '変数',
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVarList
      }
      // 3 word
      if (this.accept(['word', ',', 'word', ',', 'word', 'eq', this.yCalc])) {
        let names = [this.y[0], this.y[2], this.y[4]]
        names = this.createVarList(names, false, this.moduleOption.isExportDefault)
        const astValue = this.y[6] || this.yNop()
        for (const i in names) {
          (names[i] as TokenRef).isWrite = true
        }
        return {
          type: 'def_local_varlist',
          names,
          vartype: '変数',
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVarList
      }
      // 4 word
      if (this.accept(['word', ',', 'word', ',', 'word', ',', 'word', 'eq', this.yCalc])) {
        let names = [this.y[0], this.y[2], this.y[4], this.y[6]]
        names = this.createVarList(names, false, this.moduleOption.isExportDefault)
        const astValue = this.y[8] || this.yNop()
        for (const i in names) {
          (names[i] as TokenRef).isWrite = true
        }
        return {
          type: 'def_local_varlist',
          names,
          vartype: '変数',
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVarList
      }
      // 5 word
      if (this.accept(['word', ',', 'word', , ',', 'word', ',', 'word', ',', 'word', 'eq', this.yCalc])) {
        let names = [this.y[0], this.y[2], this.y[4], this.y[6], this.y[8]]
        names = this.createVarList(names, false, this.moduleOption.isExportDefault)
        const astValue = this.y[10] || this.yNop()
        for (const i in names) {
          (names[i] as TokenRef).isWrite = true
        }
        return {
          type: 'def_local_varlist',
          names,
          vartype: '変数',
          blocks: [astValue],
          ...this.fromSourceMap(map)
        } as AstDefVarList
      }
    }
    return null
  }

  /**
   * 配列のインデックスが1から始まる場合を考慮するか
   * @param {Ast} node
   * @returns
   */
  checkArrayIndex (node: Ast): Ast {
    // 配列が0から始まるのであればそのまま返す
    if (this.arrayIndexFrom === 0) { return node }
    // 配列が1から始まるのであれば演算を加えて返す
    const minus_num = {
      ...node,
      'type': 'number',
      'value': this.arrayIndexFrom
    } 
    return {
      ...node,
      type: 'op',
      operator: '-',
      blocks: [node, minus_num]
    } as AstOperator
  }

  /**
   * 配列のインデックスを逆順にするのを考慮するか
   * @param {Ast[]| null} ary
   */
  checkArrayReverse (ary: Ast[] | null): Ast[] {
    if (!ary) { return [] }
    if (!this.flagReverseArrayIndex) { return ary }
    // 二次元以上の配列変数のアクセスを[y][x]ではなく[x][y]と順序を変更する
    if (ary.length <= 1) { return ary }
    return ary.reverse()
  }

  /** @returns {AstLetArray | null} */
  yLetArrayAt (map: SourceMap): AstLetArray | null {
    // 一次元配列
    if (this.accept(['word', '@', this.yValue, 'eq', this.yCalc])) {
      const astValue = this.y[4]
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, this.checkArrayIndex(this.y[2])],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 二次元配列
    if (this.accept(['word', '@', this.yValue, '@', this.yValue, 'eq', this.yCalc])) {
      const astValue = this.y[6]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 三次元配列
    if (this.accept(['word', '@', this.yValue, '@', this.yValue, '@', this.yValue, 'eq', this.yCalc])) {
      const astValue = this.y[8]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4]), this.checkArrayIndex(this.y[6])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 二次元配列(カンマ指定)
    if (this.accept(['word', '@', this.yValue, ',', this.yValue, 'eq', this.yCalc])) {
      const astValue = this.y[6]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 三次元配列(カンマ指定)
    if (this.accept(['word', '@', this.yValue, ',', this.yValue, ',', this.yValue, 'eq', this.yCalc])) {
      const astValue = this.y[8]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4]), this.checkArrayIndex(this.y[6])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }
    return null
  }

  /** @returns {Ast | null} */
  yLetArrayBracket (map: SourceMap): AstBlocks|null {
    // 一次元配列
    if (this.accept(['word', '[', this.yCalc, ']', 'eq', this.yCalc])) {
      const astValue = this.y[5]
      const astIndexes = [this.checkArrayIndex(this.y[2])]
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 二次元配列 --- word[a][b] = c
    if (this.accept(['word', '[', this.yCalc, ']', '[', this.yCalc, ']', 'eq', this.yCalc])) {
      const astValue = this.y[8]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[5])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        tag: '2',
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }
    // 二次元配列 --- word[a, b] = c
    if (this.accept(['word', '[', this.yCalc, ',', this.yCalc, ']', 'eq', this.yCalc])) {
      const astValue = this.y[7]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        tag: '2',
        ...this.fromSourceMap(map)
      } as AstLetArray
    }

    // 三次元配列 --- word[a][b][c] = d
    if (this.accept(['word', '[', this.yCalc, ']', '[', this.yCalc, ']', '[', this.yCalc, ']', 'eq', this.yCalc])) {
      const astValue = this.y[11]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[5]), this.checkArrayIndex(this.y[8])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }
    // 三次元配列 --- word[a, b, c] = d
    if (this.accept(['word', '[', this.yCalc, ',', this.yCalc, ',', this.yCalc, ']', 'eq', this.yCalc])) {
      const astValue = this.y[9]
      const astIndexes = this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4]), this.checkArrayIndex(this.y[6])])
      return {
        type: 'let_array',
        name: (this.getVarName(this.y[0]) as AstStrValue).value,
        index: this.checkArrayReverse([this.checkArrayIndex(this.y[2]), this.checkArrayIndex(this.y[4]), this.checkArrayIndex(this.y[6])]),
        blocks: [astValue, ...astIndexes],
        checkInit: this.flagCheckArrayInit,
        ...this.fromSourceMap(map)
      } as AstLetArray
    }
    return null
  }

  /** @returns {Ast | null} */
  yCalc (): Ast|null {
    const map = this.peekSourceMap()
    if (this.check('eol')) { return null }
    // 値を一つ読む
    const t = this.yGetArg()
    if (!t) { return null }
    // 助詞がある？ つまり、関数呼び出しがある？
    if (t.josi === '') { return t } // 値だけの場合
    // 関数の呼び出しがあるなら、スタックに載せて関数読み出しを呼ぶ
    const tmpReadingCalc = this.isReadingCalc
    this.isReadingCalc = true
    this.pushStack(t)
    const t1 = this.yCall()
    this.isReadingCalc = tmpReadingCalc
    if (!t1) {
      // 関数がなければ、先ほど積んだ値をスタックから取り出して返す
      return this.popStack()
    }
    // 計算式をfCalcとする
    let fCalc:Ast = t1
    // それが連文か助詞を読んで確認
    if (RenbunJosi.indexOf(t1.josi || '') >= 0) {
      // 連文なら右側を読んで左側とくっつける
      const t2 = this.yCalc()
      if (t2) {
        fCalc = {
          type: 'renbun',
          operator: 'renbun',
          blocks: [t1, t2],
          josi: t2.josi,
          ...this.fromSourceMap(map)
        } as AstOperator
      }
    }
    // 演算子があれば続ける
    const op = this.peek()
    if (!op) { return fCalc }
    if (opPriority[op.type]) {
      return this.yGetArgOperator(fCalc)
    }
    return fCalc
  }

  /** @returns {Ast | null} */
  yValueKakko (): Ast | null {
    if (!this.check('(')) { return null }
    let t = this.get() // skip '('
    if (!t) {
      this.errorInfos.addFromToken('ERROR', 'checkedButNotget', {}, this.peekDef())
      return null
    }
    this.saveStack()
    let v = this.yCalc() || this.ySentence()
    if (v === null) {
      const v2 = this.get()
      logger.debug('(...)の解析エラー。' + this.nodeToStr(v2, { depth: 1 }, true) + 'の近く', t)
      this.errorInfos.addFromToken('ERROR', 'parseErrorNear', { nodestr: this.nodeToStr(v2, { depth: 1 }, false) }, t)
      v = this.yNop()
    }
    let closeParent: Token|null = null
    if (!this.check(')')) {
      logger.debug('(...)の解析エラー。' + this.nodeToStr(v, { depth: 1 }, true) + 'の近く', t)
      this.errorInfos.addFromToken('ERROR', 'parseErrorNear', { nodestr: this.nodeToStr(v, { depth: 1 }, false) }, t)
    } else {
      closeParent = this.get() // skip ')'
    }

    this.loadStack()
    if (closeParent) {
      v.josi = closeParent.josi
    }
    return v
  }

  yConst (tok: Token, map: SourceMap): Ast {
    // ['number', 'bigint', 'string']
    const astConst: AstConst = {
      type: tok.type as NodeType,
      value: tok.value,
      josi: tok.josi,
      ...map
    }
    return astConst
  } 

  /** @returns {Ast | null} */
  yValue (): Ast | null {
    const map = this.peekSourceMap()

    // カンマなら飛ばす #877
    if (this.check(',')) { this.get() }

    // 展開あり文字列
    if (this.check2(['STRING_EX', 'STRING_INJECT_START'])) {
      return this.yTemplateString()
    }
    // プリミティブな値
    if (this.checkTypes(['number', 'bigint', 'string'])) {
      return this.yConst(this.getCur(), map)
    }

    // 丸括弧
    if (this.check('(')) { return this.yValueKakko() }

    // マイナス記号
    if (this.check2(['-', 'number']) || this.check2(['-', 'word']) || this.check2(['-', ['func', 'user_func', 'sys_func']])) {
      const m = this.get() // skip '-'
      const v = this.yValue()
      const josi = (v && v.josi) ? v.josi : ''
      const astLeft = { type: 'number', value: -1, ...this.peekSourceMap() } as AstConst
      const astRight = v || this.yNop()
      return {
        type: 'op',
        operator: '*',
        blocks: [astLeft, astRight],
        josi,
        ...map,
        end: this.peekSourceMap()
      } as AstOperator
    }
    // NOT
    if (this.check('not')) {
      this.get() // skip '!'
      const v = this.yValue()
      const josi = (v && v.josi) ? v.josi : ''
      return {
        type: 'not',
        operator: 'not',
        blocks: [v],
        josi,
        ...this.fromSourceMap(map)
      } as AstOperator
    }
    // JSON object
    const a = this.yJSONArray()
    if (a) { return a }
    const o = this.yJSONObject()
    if (o) { return o }
    // 一語関数
    const splitType = operatorList.concat(['eol', ')', ']', 'ならば', '回', '間', '反復', '条件分岐'])
    if (this.check2([['func', 'user_func', 'sys_func'], splitType])) {
      let oneWordFuncToken = this.get()
      if (!oneWordFuncToken) {
        this.errorInfos.addFromToken('ERROR', 'checkedButNotget', {}, this.peekDef())
        oneWordFuncToken = NewEmptyToken()
      }
      const tt = oneWordFuncToken as TokenCallFunc
      const f = this.getVarNameRef(tt)
      this.usedFuncs.add(f.value)
      // 引数の個数をチェック
      const meta = tt.meta
      const args: any = []
      if (!meta) {
        this.errorInfos.addFromToken('ERROR', 'notfondOneWordFunc', { funcName: f.value}, tt)
      }
      if (meta.args && meta.args.length === 1) {
        args.push({ type: 'word', value: 'それ' })
      } else if (meta.args && meta.args.length >= 2) {
        this.errorInfos.addFromToken('ERROR', 'noParamForOneWordFunc', { funcName: f.value, paramCount: meta.args.length }, tt)
      }
      return {
        type: 'func',
        name: f.value,
        blocks: args,
        josi: f.josi,
        meta,
        asyncFn: meta.isAsync ? true : false,
        ...this.fromSourceMap(map)
      } as AstCallFunc
    }
    // C風関数呼び出し FUNC(...)
    if (this.check2([['func', 'user_func', 'sys_func', 'word'], '(']) && this.peekDef().josi === '') {
      const funcNameToken = this.peek()
      if (this.accept([['func', 'user_func', 'sys_func', 'word'], '(', this.yGetArgParen, ')'])) {
        const funcToken = this.getVarNameRef(this.y[0])
        const meta = (funcToken as TokenCallFunc).meta // undefinedかもしれない
        const args = this.y[2]
        const funcName: string = funcToken.value
        let asyncFn = false
        this.usedFuncs.add(funcName)
        // 引数の個数をチェック
        if (meta && meta.args) {
          // 引数の個数が異なる場合
          if (meta.args.length === args.length) {
            // ok
          } else if (meta.isVariableJosi) {
            // ok
          } else { // 引数の個数が違う
            this.errorInfos.addFromToken('ERROR', 'mismatchFunctionArgumentNumber', { funcname: funcToken.value, defargsnum: meta.args.length, realargsnum: args.length }, funcToken)
          }
          asyncFn = meta.isAsync ? true : false
        }
        return {
          type: 'func',
          name: funcName,
          blocks: args,
          josi: this.y[3].josi,
          meta,
          asyncFn,
          ...this.fromSourceMap(map)
        } as AstCallFunc
      }
      this.errorInfos.addFromToken('ERROR', 'errorCallForCstyleFunc', {}, funcNameToken || NewEmptyToken())
      this.skipToEol()
      return this.yNop()
    }
    // 無名関数(関数オブジェクト)
    if (this.check('def_func')) { return this.yMumeiFunc() }
    // 変数
    const word = this.yValueWord()
    if (word) { return word }
    // 関数への参照
    const funcPtr = this.yValueFuncPointer()
    if (funcPtr) { return funcPtr }
    // その他
    return null
  }

  yValueWordGetIndex (ast: Ast): boolean {
    if (!ast.index) { ast.index = [] }
    // word @ a, b, c
    if (this.check('@')) {
      if (this.accept(['@', this.yValue, ',', this.yValue, ',', this.yValue])) {
        ast.index.push(this.checkArrayIndex(this.y[1]))
        ast.index.push(this.checkArrayIndex(this.y[3]))
        ast.index.push(this.checkArrayIndex(this.y[5]))
        ast.index = this.checkArrayReverse(ast.index)
        ast.josi = this.y[5].josi
        return true
      }
      if (this.accept(['@', this.yValue, ',', this.yValue])) {
        ast.index.push(this.checkArrayIndex(this.y[1]))
        ast.index.push(this.checkArrayIndex(this.y[3]))
        ast.index = this.checkArrayReverse(ast.index)
        ast.josi = this.y[3].josi
        return true
      }
      if (this.accept(['@', this.yValue])) {
        ast.index.push(this.checkArrayIndex(this.y[1]))
        ast.josi = this.y[1].josi
        return true
      }
      this.errorInfos.addFromToken('ERROR', 'invalidAfterAtmark', {}, ast)
      this.skipToEol()
      return true
    }
    if (this.check('[')) {
      if (this.accept(['[', this.yCalc, ']'])) {
        ast.index.push(this.checkArrayIndex(this.y[1]))
        ast.josi = this.y[2].josi
        return this.y[2].josi === '' // 助詞があればそこで終了(false)を返す (#1627)
      }
    }
    if (this.check('[')) {
      if (this.accept(['[', this.yCalc, ',', this.yCalc, ']'])) {
        const index = [
          this.checkArrayIndex(this.y[1]),
          this.checkArrayIndex(this.y[3])
        ]
        const aa = ast.index.pop()
        ast.index = this.checkArrayReverse(index)
        if (aa) { ast.index.unshift(aa) }
        ast.josi = this.y[4].josi
        return this.y[4].josi === '' // 助詞があればそこで終了(false)を返す
      }
    }
    if (this.check('[')) {
      if (this.accept(['[', this.yCalc, ',', this.yCalc, ',', this.yCalc, ']'])) {
        const index = [
          this.checkArrayIndex(this.y[1]),
          this.checkArrayIndex(this.y[3]),
          this.checkArrayIndex(this.y[5])
        ]
        const aa = ast.index.pop()
        ast.index = this.checkArrayReverse(index)
        if (aa) { ast.index.unshift(aa) }
        ast.josi = this.y[6].josi
        return this.y[6].josi === '' // 助詞があればそこで終了(false)を返す
      }
    }
    return false
  }

  /** @returns {Ast | null} */
  yValueFuncPointer (): Ast|null {
    const map = this.peekSourceMap()
    if (this.check2(['func_ptr', ['user_func', 'sys_func']])) {
      //  && peektoken && (peektoken as TokenCallFunc).isFuncPointer
      this.get()
      const t = this.getCur()
      const ast:Ast = {
        type: 'func_pointer',
        name: t.value,
        josi: t.josi,
        ...this.fromSourceMap(map)
      }
      return ast
    }
    return null
  }

  /** @returns {Ast | null} */
  yValueWord (): Ast|null {
    const map = this.peekSourceMap()
    if (this.check2(['word'])) {
      const t = this.getCur()
      const word = this.getVarNameRef(t)

      // word[n] || word@n
      if (word.josi === '' && this.checkTypes(['[', '@'])) {
        const ast: Ast = {
          type: 'ref_array',
          name: word,
          index: [],
          josi: '',
          ...this.fromSourceMap(map)
        }
        while (!this.isEOF()) {
          if (!this.yValueWordGetIndex(ast)) { break }
        }
        if (ast.index && ast.index.length === 0) {
           this.errorInfos.addFromToken('ERROR', 'missArrayIndex', { arrayname: word.value }, word)
        }
        return ast
      }

      // オブジェクトプロパティ構文(参照) word$prop (#1793)
      if (word.josi === '' && (this.check2(['$', ['word', 'string', 'sys_func', 'user_func']]))) {
        const propList: Ast[] = []
        let josi = ''
        while (this.check('$')) {
          this.get() // skip '$'
          const prop = this.get() as Token
          if (prop.type === 'word') {
            prop.type = 'string'
          } else if (prop.type ===  'sys_func' || prop.type ===  'user_func') {
            delete (prop as any).meta
            prop.type = 'string'
          }
          propList.push(prop as Ast)
          josi = prop.josi
        }
        return {
          type: 'ref_prop', // プロパティ参照
          name: word,
          index: propList,
          josi: josi,
          ...this.fromSourceMap(map)
        }
      }

      return word as any // Token to Ast
    }
    return null
  }

  yTemplateString (): Ast {
    //logger.info(`yTemplateString: start`)
    const map = this.peekSourceMap()
    const asts: Ast[] = []
    let lastToken: Token|undefined
    while (!this.isEOF()) {
      if (!this.check('STRING_EX')) {
        //console.log(`yTemplateString: not STARING_EX`)
        //logger.info(`yTemplateString: encount invalid token type: ${this.peekDef().type}`)
        break
      }
      let str = this.getCur() // string
      lastToken = str
      str.type = 'string'
      asts.push({
        type: str.type as NodeType,
        value: str.value,
        josi: str.josi,
        ...map
      } as AstConst)
      //console.log(`yTemplateString: range : ${str.startLine}:${str.startCol} - ${str.endLine}-${str.endCol}`)
      //console.log(`yTemplateString: string :${str.value}`)
      if (!this.check('STRING_INJECT_START')) { break }
      logger.info(`yTemplateString: inject start`)
      let s1 = this.getCur() // inject start char
      //console.log(`yTemplateString: range : ${s1.startLine}:${s1.startCol} - ${s1.endLine}-${s1.endCol}`)
      while (!this.isEOF() && !this.check('STRING_INJECT_END')) {
        if (!this.get()) {
          //
        }
      }
      let e1 = this.getCur() // inject end char
      //console.log(`yTemplateString: range : ${e1.startLine}:${e1.startCol} - ${e1.endLine}-${e1.endCol}`)
      if (e1.type !== 'STRING_INJECT_END') {
        //console.log(`yTemplateString: not STRING_INJECT_END`)
        //logger.info(`yTemplateString: encount invalid token type: ${this.peekDef().type}`)
        break
      }
      //logger.info(`yTemplateString: inject end`)
    }
    //logger.info(`yTemplateString: end`)
    return {
      type: 'string',
      blocks: asts,
      josi: lastToken !== undefined ? lastToken.josi : '',
      ...this.fromSourceMap(map)
    } as AstBlocks
  }
  /** 変数を生成 */
  createVar (word: Token|Ast, isConst: boolean, isExport: boolean, isActiveDeclare: boolean): Token|Ast {
    let gname: string = (word as AstStrValue).value
    const typeName: 'var'|'const'|'func' = isConst ? 'const' : 'var'
    if (this.funcLevel === 0) {
      // global ?
      if (gname.indexOf('__') >= 0) {
        this.errorInfos.addFromToken('ERROR', 'cannnotDeclareOtherModule', { name: gname }, word)        
        return word
      } else {
        if (typeName === 'const') {
          const defValue: GlobalConstant = {
            name: gname,
            nameNormalized: trimOkurigana(gname),
            modName: this.modName,
            uri: this.moduleEnv.uri,
            type: 'const',
            isExport,
            isPrivate: false,
            range: Nako3Range.fromToken(word as Token),
            origin: 'global',
            isRemote: this.moduleEnv.isRemote,
            activeDeclare: isActiveDeclare,
            value: ''
          }
          this.addGlobalvars(defValue, word as Token)
        } else {
          const defValue: GlobalVariable = {
            name: gname,
            nameNormalized: trimOkurigana(gname),
            modName: this.modName,
            uri: this.moduleEnv.uri,
            type: 'var',
            isExport,
            isPrivate: false,
            range: Nako3Range.fromToken(word as Token),
            origin: 'global',
            isRemote: this.moduleEnv.isRemote,
            activeDeclare: isActiveDeclare
          }
          this.addGlobalvars(defValue, word as Token)
        }
        const wordAst = word as AstStrValue
        wordAst.value = gname
        return word
      }
    } else {
      // local
      if (typeName === 'const') {
        this.addLocalvars({
          name: gname,
          nameNormalized: trimOkurigana(gname),
          type: 'const',
          scopeId: this.scopeId,
          activeDeclare: isActiveDeclare,
          range: Nako3Range.fromToken(word as Token),
          origin: 'local',
          value: ''
        })
      } else {
        this.addLocalvars({
          name: gname,
          nameNormalized: trimOkurigana(gname),
          type: 'var',
          scopeId: this.scopeId,
          activeDeclare: isActiveDeclare,
          range: Nako3Range.fromToken(word as Token),
          origin: 'local'
        })
  
      }
      return word
    }
  }

  /** 変数名を検索して解決する
   * @param {Ast|Token} word
   * @return {Ast|Token}
   */
  getVarName (word: Token|Ast): Token|Ast {
    // check word name
    const f = this.findVar((word as AstStrValue).value)
    if (f) {
      if (f && f.scope === 'global') { (word as AstStrValue).value = f.name }
      return word
    }
    // 変数が見つからない
    this.createVar(word, false, this.moduleOption.isExportDefault, false)
    return word
  }

  /** 変数名を検索して解決する */
  getVarNameRef (word: Token): Token {
    // check word name
    const f = this.findVar(word.value)
    if (!f) { // 変数が見つからない
      // nop
    } else if (f && f.scope === 'global') {
      word.value = f.name
    }
    return word
  }

  /** 複数の変数名を検索して解決する */
  createVarList (words: Token[], isConst: boolean, isExport: boolean): Token[] {
    for (let i = 0; i < words.length; i++) {
      words[i] = this.createVar(words[i], isConst, isExport, false) as Token
    }
    return words
  }

  yJSONObjectValue (): Ast[] {
    // 戻り値の形式
    // Astblocks.blocks = [key1, value1, key2, value2, key3, value3 ...]
    const a: Ast[] = []
    const firstToken = this.peek()
    if (!firstToken) { return [] }
    while (!this.isEOF()) {
      while (this.check('eol')) { this.get() }
      if (this.check('}')) { break }
      
      // key : value
      if (this.accept([['word', 'sys_func', 'user_func'], ':', this.yCalc])) {
        if (this.y[0].type === 'sys_func' || this.y[0].type === 'user_func') {
          delete (this.y[0] as any).meta
        }
        this.y[0].type = 'string' // キー名の文字列記号省略の場合
        a.push(this.y[0])
        a.push(this.y[2])
      }
      // 'key' : value
      else if (this.accept(['string', ':', this.yCalc])) {
        a.push(this.y[0])
        a.push(this.y[2])
      }
      // key
      else if (this.accept([['word', 'sys_func', 'user_func']])) {
        const key = this.y[0]
        const val = JSON.parse(JSON.stringify(key)) as Ast
        if (key.type === 'sys_func' || key.type === 'user_func') {
          delete (key as any).meta
        }
        key.type = 'string' // キー名の文字列記号省略の場合
        a.push(key)
        a.push(val)
      }
      // str or num
      else if (this.checkTypes(['string', 'number'])) {
        const w = this.getCur() as Ast // Tokenを強制的にAstに変換している
        a.push(w)
        a.push(w)
      }
      else {
        this.errorInfos.addFromToken('ERROR', 'requireCloseParentisForDictInit', {}, firstToken)
        return a
       }
      if (this.check(',')) { this.get() }
    }
    return a
  }

  yJSONObject(): AstBlocks | Ast | null {
    const map = this.peekSourceMap()
    const a = this.yJSONObjectRaw()
    if (!a) { return null }
    // 配列の直後に@や[]があるか？助詞がある場合には、別の引数の可能性があるので無視。 (例) [0,1,2]を[3,4,5]に配列＊＊＊
    if (a.josi === '' && this.checkTypes(['@', '['])) {
      const ast: Ast = {
        type: 'ref_array',
        name: '__ARRAY__',
        index: [a],
        josi: '',
        ...this.fromSourceMap(map)
      }
      this.yValueWordGetIndex(ast)
      return ast
    }
    return a
  }

  /** @returns {Ast | null} */
  yJSONObjectRaw (): AstBlocks | null {
    const map = this.peekSourceMap()
    if (this.accept(['{', '}'])) {
      return {
        type: 'json_obj',
        blocks: [],
        josi: this.y[1].josi,
        ...this.fromSourceMap(map)
      }
    }

    if (this.accept(['{', this.yJSONObjectValue, '}'])) {
      return {
        type: 'json_obj',
        blocks: this.y[1],
        josi: this.y[2].josi,
        ...this.fromSourceMap(map)
      }
    }

    // 辞書初期化に終わりがなかった場合 (エラーチェックのため) #958
    if (this.accept(['{', this.yJSONObjectValue])) {
      this.errorInfos.addFromToken('ERROR', 'requireCloseParentisForDictInit', {}, this.y[1])
    }

    return null
  }

  yJSONArrayValue (): Ast[] {
    if (this.check('eol')) { this.get() }
    // Arrayの最初の値
    const v1 = this.yCalc()
    if (v1 === null) { return [] }
    if (this.check(',')) { this.get() }
    const a: Ast[] = [v1]
    // 2つ目以降の値を取得
    while (!this.isEOF()) {
      if (this.check('eol')) { this.get() }
      if (this.check(']')) { break }
      const v2 = this.yCalc()
      if (v2 === null) { break }
      if (this.check(',')) { this.get() }
      a.push(v2)
    }
    return a
  }

  yJSONArray(): AstBlocks | Ast | null {
    const map = this.peekSourceMap()
    // 配列を得る
    const a = this.yJSONArrayRaw()
    if (!a) { return null }
    // 配列の直後に@や[]があるか？助詞がある場合には、別の引数の可能性があるので無視。 (例) [0,1,2]を[3,4,5]に配列＊＊＊
    if (a.josi === '' && this.checkTypes(['@', '['])) {
      const ast: Ast = {
        type: 'ref_array',
        name: '__ARRAY__',
        index: [a],
        josi: '',
        ...this.fromSourceMap(map)
      }
      this.yValueWordGetIndex(ast)
      return ast
    }
    return a
  }

  /** @returns {AstBlocks | null} */
  yJSONArrayRaw (): AstBlocks | null {
    const map = this.peekSourceMap()
    if (this.accept(['[', ']'])) {
      return {
        type: 'json_array',
        blocks: [],
        josi: this.y[1].josi,
        ...this.fromSourceMap(map)
      }
    }

    if (this.accept(['[', this.yJSONArrayValue, ']'])) {
      return {
        type: 'json_array',
        blocks: this.y[1],
        josi: this.y[2].josi,
        ...this.fromSourceMap(map)
      }
    }

    // 配列に終わりがなかった場合 (エラーチェックのため) #958
    if (this.accept(['[', this.yJSONArrayValue])) {
      this.errorInfos.addFromToken('ERROR', 'requireCloseParentisForArrayInit', {}, this.y[1])
    }

    return null
  }

  /** エラー監視構文 */
  yTryExcept (): AstBlocks | null {
    const map = this.peekSourceMap()
    if (!this.check('エラー監視')) { return null }
    const kansiIndex = this.getIndex()
    let indentSemantic = this.moduleOption.isIndentSemantic
    const kansi = this.getCur() // エラー監視
    if (this.check(':')) {
      this.get()
      indentSemantic = true
    }
    const linkMain : LinkDef = { childTokenIndex: [kansiIndex]};
    (kansi as TokenLink).link = linkMain
    const statementDef : StatementDef = { type: 'エラー監視' };
    (kansi as TokenStatement).statement = statementDef
    this.indentPush('エラー監視')
    this.currentIndentLevel = kansi.indent.level
    this.currentIndentSemantic = indentSemantic
    const block = this.yBlock()
    if (this.currentIndentSemantic) {
      const level = this.peek()?.indent.level
      if (level !== undefined && level <= this.currentIndentLevel) {
      }
    } else {
      if (this.check('エラーならば')) {
        // skip
      }
    }
    this.indentPop(['エラー監視'])

    if (this.check('エラーならば')) {
      const narabaIndex = this.getIndex()
      const naraba = this.getCur() // エラーならば
      let indentSemantic = this.moduleOption.isIndentSemantic
      if (this.check(':')) {
        this.get()
        indentSemantic = true
      }
      (naraba as TokenLink).link = { mainTokenIndex: kansiIndex }
      linkMain.childTokenIndex.push(narabaIndex)
      this.indentPush('エラーならば')
      this.currentIndentLevel = naraba.indent.level
      this.currentIndentSemantic = indentSemantic
    } else {
      this.errorInfos.addFromToken('ERROR', 'noCatchAtTry', {}, kansi)
      this.indentPush('エラーならば')
      this.currentIndentLevel = kansi.indent.level
      this.currentIndentSemantic = this.moduleOption.isIndentSemantic
    }

    const errBlock = this.yBlock()
    if (this.currentIndentSemantic) {
      const level = this.peek()?.indent.level
      if (level !== undefined && level <= this.currentIndentLevel) {
      }
    } else {
      if (this.check('ここまで')) {
        const kokomadeIndex = this.getIndex()
        const kokomade = this.getCur();
        (kokomade as TokenLink).link = { mainTokenIndex: kansiIndex }
        linkMain.childTokenIndex.push(kokomadeIndex)
        } else {
        this.errorInfos.addFromToken('ERROR', 'noKokomadeAtTry', {}, kansi)
      }
    }
    this.indentPop(['エラーならば'])

    return {
      type: 'try_except',
      blocks: [block, errBlock],
      josi: '',
      ...this.fromSourceMap(map)
    }
  }

  /** 関数ごとにasyncFnが必要か確認する */
  _checkAsyncFn (node: Ast): boolean {
    if (!node) { return false }
    // 関数定義があれば関数
    if (node.type == 'def_func' || node.type == 'def_test' || node.type == 'func_obj') {
      // 関数定義でasyncFnが指定されているならtrueを返す
      const def: AstDefFunc = node as AstDefFunc
      if (def.asyncFn) { return true } // 既にasyncFnが指定されている
      // 関数定義の中身を調べてasyncFnであるならtrueに変更する
      let isAsyncFn = false
      for (const n of def.blocks) {
        if (this._checkAsyncFn(n)) {
          isAsyncFn = true
          def.asyncFn = isAsyncFn
          def.meta.isAsync = isAsyncFn
          this.isModifiedNodes = true
          return true
        }
      }
    }
    // 関数呼び出しを調べて非同期処理が必要ならtrueを返す
    if (['func','user_func','sys_func'].includes(node.type)) {
      // 関数呼び出し自体が非同期処理ならtrueを返す
      const callNode: AstCallFunc = node as AstCallFunc
      if (callNode.asyncFn) {
        return true
      }
      // 続けて、以下の関数呼び出しの引数などに非同期処理があるかどうか調べる
      // 関数の引数は、node.blocksに格納されている
      if (callNode.blocks) {
        for (const n of callNode.blocks) {
          if (this._checkAsyncFn(n)) {
            callNode.asyncFn = true
            this.isModifiedNodes = true
            return true
          }
        }
      }
      // さらに、関数のリンクを調べる
      const func = this.moduleEnv.declareThings.get(callNode.name) as GlobalFunction
      if (func && func.isAsync) {
        callNode.asyncFn = true
        this.isModifiedNodes = true
        return true
      }
      return false
    }
    // 連文 ... 現在、効率は悪いが非同期で実行することになっている
    if (node.type == 'renbun') {
      return true
    }
    // その他
    if ((node as AstBlocks).blocks) {
      for (const n of (node as AstBlocks).blocks) {
        if (this._checkAsyncFn(n)) {
          return true
        }
      }
    }
    return false
  }

  /** TokenをそのままNodeに変換するメソッド(ただし簡単なものだけ対応)
   * @returns {Ast[]}
   */
  _tokensToNodes(tokens: Token[]): Ast[] {
    const nodes: Ast[] = []
    for (const token of tokens) {
      nodes.push(this._tokenToNode(token))
    }
    return nodes
  }

  /** TokenをそのままNodeに変換するメソッド(ただし簡単なものだけ対応)
   * @returns {Ast}
   */
  _tokenToNode(token: Token): Ast {
    const map = this.peekSourceMap(token)
    if (['string','number','bigint'].includes(token.type)) {
      return this.yConst(token, map)
    }
    if (token.type === 'word') {
      return {
        type: 'word',
        value: token.value,
        josi: token.josi,
        ...map
      } as AstStrValue
    }
    if (token.type === 'eol') {
      return {
        type: 'eol',
        ...map
      }
    }
    this.errorInfos.addFromToken('ERROR', 'unknownToken', {type: token.type}, token)
    return this.yNop()
  }

  protected markColor(word: Ast|Token, value: Ast|Token):void {
    // 定数で内容が文字列１つのみの場合に色コードチェックをしてマークする
    if (value.type === 'string') { 
      const vv = (value as AstConst).value as string
      if (vv.startsWith('#')) {
        const color = cssColor.getRgba(vv)
        if (color) {
          const v = this.findVar((word as AstStrValue).value)
          if (v && v.info && v.info.type === 'const') {
            const c = v.info as LocalConstant
            c.isColor = true
            c.hint = (value as AstConst).value as string
          }
        }
      }
    }
  }
}
