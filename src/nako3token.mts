export type Nako3TokenRawType = '?'
| 'ここまで'
| 'EOL'
| 'SPACE'
| 'NUMBER_EX'
| 'NUMBER'
| 'COMMENT_LINE'
| 'COMMENT_BLOCK'
| 'def_func'
| 'CHARACTER'
| 'STRING'
| 'STRING_EX'
| 'STRING_INJECT_START'
| 'STRING_INJECT_END'
| 'ここから'
| 'もし'
| '違えば'
| 'SHIFT_R0'
| 'SHIFT_R'
| 'SHIFT_L'
| 'GE'
| 'LE'
| 'EQ'
| 'NE'
| 'GT'
| 'LT'
| 'NOT'
| 'AND'
| 'OR'
| '@'
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
| '。'
| 'WORD'

export type Nako3TokenTypeReserve = '回'
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
  | 'モード設定'
  | '取込'
  | 'モジュール公開既定値'
  | 'def_func'
  | 'WORD'

export type Nako3TokenTypeFix = 'には'
  | 'とは'
  | 'ならば'
  | 'FUNCTION_NAME'
  | 'FUNCTION_ATTRIBUTE'
  | 'FUNCTION_ARG_SEPARATOR'
  | 'FUNCTION_ARG_PARENTIS'
  | 'FUNCTION_ARG_PARAMETER'

export type Nako3TokenTypeApply = '?'
  |'ユーザー関数'
  |'ユーザー変数'
  |'ユーザー定数'

export type Nako3TokenTypePlugin = '?'
  | 'システム関数'
  | 'システム変数'
  | 'システム定数'

export type Nako3TokenType = Nako3TokenRawType
  | Nako3TokenTypeReserve
  | Nako3TokenTypeFix
  | Nako3TokenTypeApply
  | Nako3TokenTypePlugin

export type Nako3TokenGroup = '?'
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

export interface Nako3Indent {
    text: string
    level: number
    len: number
}

export interface Nako3Token {
    type: Nako3TokenType
    group: Nako3TokenGroup
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
    indent: Nako3Indent
}
