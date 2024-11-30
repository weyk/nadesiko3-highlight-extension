import { Uri } from 'vscode'
import type { GlobalFunction, GlobalVarConst, LocalVarConst } from './nako3types.mjs'
import { Nako3Range } from './nako3range.mjs'

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
| '??' // 「表示」のエイリアス
| '$' // プロパティアクセス
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
  | 'エラーならば'
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
  | 'ならば'

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
  | 'user_func'
  | 'user_var'
  | 'user_const'

export type Nako3TokenTypeParser = '?'
  | 'VARIABLE_ATTRIBUTE'
  | 'VARIABLE_ATTR_PARENTIS_START'
  | 'VARIABLE_ATTR_PARENTIS_END'
  | 'VARIABLE_ATTR_SEPARATOR'

export type Nako3TokenTypePlugin = '?'
  | 'sys_func'
  | 'sys_var'
  | 'sys_const'

export type TokenType = Nako3TokenRawType
  | Nako3TokenTypeReserve
  | Nako3TokenTypeFix
  | Nako3TokenTypeApply
  | Nako3TokenTypeParser
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
    fixType: TokenType
    parseType: TokenType
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
    uri: Uri
}

export interface TokenDefFunc extends Token {
  meta: GlobalFunction
  endTokenIndex: number
}

export interface TokenCallFunc extends Token {
  meta: GlobalFunction
  isFuncPointer: boolean
}

export interface TokenRefFunc extends Token {
  meta: GlobalFunction
}

export interface TokenRefVar extends Token {
  meta: GlobalVarConst|LocalVarConst
  isWrite?: boolean
}

export interface TokenRef extends Token {
  meta?: GlobalFunction|GlobalVarConst|LocalVarConst
  isWrite?: boolean
}

export interface TokenLink extends Token {
  link?: StatementLink
}

type TokenLinkType = '?'
  | '関数'
  | '無名関数'
  | 'もし'
  | '条件分岐'
  | '繰返'
  | '回'
  | '反復'
  | '後判定'
  | 'エラー監視'
  | 'パフォーマンスモニタ適用'
  | '実行速度優先'

export type StatementLink = LinkMain | LinkRef

export interface LinkMain {
  type: TokenLinkType
  childTokenIndex: number[]
}

export interface LinkRef {
  mainTokenIndex: number
}
