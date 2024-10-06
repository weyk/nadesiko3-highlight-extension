import { DeclareFunction, DeclareVariable } from './nako3types.mjs'

export type Nako3TokenRawType = '?'
| 'ここまで'
| 'eof'
| 'eol'
| 'eos'
| 'space'
| 'number'
| 'bigint'
| 'COMMENT_LINE'
| 'COMMENT_BLOCK'
| 'def_func'
| 'func_ptr'
| 'CHARACTER'
| 'string'
| 'fstring'
| 'STRING_EX'
| 'STRING_INJECT_START'
| 'STRING_INJECT_END'
| 'ここから'
| 'もし'
| '違えば'
| 'shift_r0'
| 'shift_r'
| 'shift_l'
| 'gteq'
| 'lteq'
| 'eq'
| 'noteq'
| 'gt'
| 'lt'
| 'not'
| 'and'
| 'or'
| '@'
| '==='
| '!=='
| '+'
| '-'
| '**'
| '*'
| '÷÷'
| '÷'
| '%'
| '^'
| '&'
| '['
| ']'
| '('
| ')'
| '|'
| '」'
| '』'
| '{'
| '}'
| ':'
| ','
| 'word'

export type Nako3TokenTypeReserve = 'もし'
  | '回'
  | '間'
  | '繰返'
  | '増繰返'
  | '減繰返'
  | '後判定'
  | '反復'
  | '抜ける'
  | '続ける'
  | '戻る'
  | '先に'
  | '次に'
  | '代入'
  | '実行速度優先'
  | 'パフォーマンスモニタ適用'
  | '定める'
  | '逐次実行'
  | '条件分岐'
  | '増'
  | '減'
  | '変数'
  | '定数'
  | 'エラー監視'
  | 'エラー'
  | 'インデント構文'
  | '非同期モード'
  | 'DNCLモード'
  | 'DNCL2モード'
  | 'モード設定'
  | '取込'
  | 'モジュール公開既定値'
  | 'def_func'
  | '厳チェック'
  | 'word'

export type Nako3TokenTypeFix = '!'
  | 'には'
  | 'とは'
  | 'ならば'
  | 'エラーならば'
  | '_eol'
  | 'FUNCTION_NAME'
  | 'FUNCTION_ATTRIBUTE'
  | 'FUNCTION_ATTR_PARENTIS_START'
  | 'FUNCTION_ATTR_PARENTIS_END'
  | 'FUNCTION_ATTR_SEPARATOR'
  | 'FUNCTION_ARG_SEPARATOR'
  | 'FUNCTION_ARG_PARENTIS_START'
  | 'FUNCTION_ARG_PARENTIS_END'
  | 'FUNCTION_ARG_ATTR_START'
  | 'FUNCTION_ARG_ATTR_END'
  | 'FUNCTION_ARG_ATTRIBUTE'
  | 'FUNCTION_ARG_PARAMETER'

export type Nako3TokenTypeApply = '?'
  |'user_func'
  |'user_var'
  |'user_const'

export type Nako3TokenTypePlugin = '?'
  | 'sys_func'
  | 'sys_var'
  | 'sys_const'

export type TokenType = Nako3TokenRawType
  | Nako3TokenTypeReserve
  | Nako3TokenTypeFix
  | Nako3TokenTypeApply
  | Nako3TokenTypePlugin

export type TokenGroup = '?'
  | '空白'
  | '区切'
  | '制御'
  | '数値'
  | 'コメント'
  | '記号'
  | '文字列'
  | '演算子'
  | '単語'
  | '疑似命令'
  | '命令'
  | '！命令'
  | '宣言'
  | '属性'

export interface Indent {
    text: string
    level: number
    len: number
}

export interface Token {
    type: TokenType
    group: TokenGroup
    len: number
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    lineCount: number
    text: string
    value: string
    resEndCol: number
    unit: ''|string
    unitStartCol?: number
    josi: ''|string
    josiStartCol?: number
    indent: Indent
    file: string
}

export interface TokenDefFunc extends Token {
  meta: DeclareFunction
}

export interface TokenCallFunc extends Token {
  meta: DeclareFunction
  isFuncPointer: boolean
}

export interface TokenRefVar extends Token {
  meta: DeclareVariable
}

export function NewEmptyToken(type: TokenType = '?', group: TokenGroup = '?', value: any = '', indent = -1, startLine = 0, file = 'main.nako3'): Token {
  return {
    type,
    group,
    value,
    indent: {
      level: 0,
      len: 0,
      text: ''
    },
    len: 0,
    lineCount: 0,
    startLine,
    startCol: 0,
    endLine: startLine,
    endCol: 0,
    resEndCol: 0,
    file,
    josi: '',
    text: '',
    unit: ''
  }
}
