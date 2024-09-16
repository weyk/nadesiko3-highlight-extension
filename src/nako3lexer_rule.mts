import { Nako3Indent, Nako3TokenType, Nako3TokenTypeReserve, Nako3TokenGroup } from './nako3token.mjs'

export type ProcMapKey = 'cbCommentBlock'|'cbCommentLine'|'cbString'|'cbStringEx'|'cbWord'
export type SubProcOptArgs = [] | [string, string] | [string, string, Nako3TokenType]
export type SubProc = (text: string, indent: Nako3Indent, opts: SubProcOptArgs) => number
export type ProcMap = { [K in ProcMapKey]: SubProc }

export const lexRulesRE = {
    kanakanji: /^[\u3005\u4E00-\u9FCF_a-zA-Z0-9ァ-ヶーａ-ｚＡ-Ｚ０-９\u2460-\u24FF\u2776-\u277F\u3251-\u32BF]+/,
    hira: /^[ぁ-ん]/,
    allHiragana: /^[ぁ-ん]+$/,
    ijoIka: /^.+(以上|以下|超|未満)$/,
    andOr: /^(かつ|または)/,
    unit: /^(円|ドル|元|歩|㎡|坪|度|℃|°|個|つ|本|冊|才|歳|匹|枚|皿|セット|羽|人|件|行|列|機|品|m|ｍ|mm|cm|ｃｍ|km|ｋｍ|g|ｇ|kg|ｋｇ|t|ｔ|px|ｐｘ|dot|ｄｏｔ|pt|ｐｔ|em|ｅｍ|b|ｂ|mb|ｍｂ|kb|ｋｂ|gb|ｇｂ)/,
    space: /^( |　|\t|・|⎿|└|｜)+/
}

interface LexRule {
    name: Nako3TokenType
    group: Nako3TokenGroup
    pattern: string|RegExp
    proc?: ProcMapKey
    procArgs?: SubProcOptArgs
    isFirstCol?: boolean
    withJosi?: boolean
    withUnit?: boolean
    withToten?: boolean
} 

export const lexRules: LexRule[] = [
    { name: 'ここまで', group: '制御', pattern: ';;;' },
    { name: 'EOL', group: '区切', pattern: '\r\n' },
    { name: 'EOL', group: '区切', pattern: '\r' },
    { name: 'EOL', group: '区切', pattern: '\n' },
    { name: 'SPACE', group: '空白', pattern: lexRulesRE.space },
    { name: 'NUMBER_EX', group: '数値', pattern: /^0[xX][0-9a-fA-F]+(_[0-9a-fA-F]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^0[oO][0-7]+(_[0-7]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^0[bB][0-1]+(_[0-1]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^\d+(_\d+)*?n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^０[ｘＸ][０-９ａ-ｆＡ-Ｆ]+([_＿][０-９ａ-ｆＡ-Ｆ]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^０[ｏＯ][０-７]+([_＿][０-７]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^０[ｂＢ][０１]+([_＿][０１]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', group: '数値', pattern: /^[０-９]+([_＿][０-９]+)*?[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^0[xX][0-9a-fA-F]+(_[0-9a-fA-F]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^0[oO][0-7]+(_[0-7]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^0[bB][0-1]+(_[0-1]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^\d+(_\d+)*\.(\d+(_\d+)*)?([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^\.\d+(_\d+)*([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^\d+(_\d+)*([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^０[ｘＸ][０-９ａ-ｆＡ-Ｆ]+([_＿][０-９ａ-ｆＡ-Ｆ]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^０[ｏＯ][０-７]+([_＿][０-７]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^０[ｂＢ][０１]+([_＿][０１]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^[０-９]+([_＿][０-９]+)*[.．]([０-９]+([_＿][０-９]+)*)?([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^[.．][０-９]+([_＿][０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', group: '数値', pattern: /^[０-９]+(_[０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'COMMENT_LINE', group: 'コメント', pattern: /^(#|＃|\/\/|／／)/, proc: 'cbCommentLine' },
    { name: 'COMMENT_BLOCK', group: 'コメント', pattern: '/*', proc: 'cbCommentBlock', procArgs: ['/*', '*/']  },
    { name: 'COMMENT_BLOCK', group: 'コメント', pattern: '／＊', proc: 'cbCommentBlock', procArgs: ['／＊', '＊／'] },
    { name: 'def_func', group: '記号', pattern: '●' },
    { name: 'def_func', group: '記号', pattern: '*', isFirstCol: true },
    { name: 'STRING', group: '文字列', pattern: '\'', proc: 'cbString', procArgs: ['\'', '\'', 'STRING'] },
    { name: 'STRING', group: '文字列', pattern: '’', proc: 'cbString', procArgs: ['’', '’', 'STRING'] },
    { name: 'STRING', group: '文字列', pattern: '『', proc: 'cbString', procArgs: ['『', '』', 'STRING'] },
    { name: 'STRING', group: '文字列', pattern: '🌿', proc: 'cbString', procArgs: ['🌿', '🌿', 'STRING'] },
    { name: 'STRING_EX', group: '文字列', pattern: '"', proc: 'cbStringEx', procArgs: ['"', '"', 'STRING_EX'] },
    { name: 'STRING_EX', group: '文字列', pattern: '”', proc: 'cbStringEx', procArgs: ['”', '”', 'STRING_EX'] },
    { name: 'STRING_EX', group: '文字列', pattern: '「', proc: 'cbStringEx', procArgs: ['「', '」', 'STRING_EX'] },
    { name: 'STRING_EX', group: '文字列', pattern: '“', proc: 'cbStringEx', procArgs: ['“', '”', 'STRING_EX'] },
    { name: 'STRING_EX', group: '文字列', pattern: '🌴', proc: 'cbStringEx', procArgs: ['🌴', '🌴', 'STRING_EX'] },
    { name: 'ここから', group: '制御', pattern: 'ここから' },
    { name: 'ここまで', group: '制御', pattern: 'ここまで' },
    { name: 'ここまで', group: '制御', pattern: '💧' },
    { name: 'もし', group: '制御', pattern: /^もしも?/, withToten: true },
    { name: '違えば', group: '制御', pattern: /^違(えば)?/, withToten: true },
    { name: 'SHIFT_R0', group: '演算子', pattern: /^(>>>|＞＞＞)/ },
    { name: 'SHIFT_R', group: '演算子', pattern: /^(>>|＞＞)/ },
    { name: 'SHIFT_L', group: '演算子', pattern: /^(<<|＜＜)/ },
    { name: 'GE', group: '演算子', pattern: /^(≧|>=|=>|＞＝|＝＞)/ },
    { name: 'LE', group: '演算子', pattern: /^(≦|<=|=<|＜＝|＝＜)/ },
    { name: 'NE', group: '演算子', pattern: /^(≠|<>|!=|＜＞|！＝)/ },
    { name: 'EQ', group: '演算子', pattern: /^(==?|＝＝?)/ },
    { name: 'NOT', group: '演算子', pattern: /^(!|💡|！)/ },
    { name: 'GT', group: '演算子', pattern: /^(>|＞)/ },
    { name: 'LT', group: '演算子', pattern: /^(<|＜)/ },
    { name: 'AND', group: '演算子', pattern: /^(かつ|&&|and\s)/ },
    { name: 'OR', group: '演算子', pattern: /^(または|或いは|あるいは|or\s|\|\|)/ },
    { name: '@', group: '記号', pattern: /^(@|＠)/ },
    { name: '+', group: '演算子', pattern: /^(\+|＋)/ },
    { name: '-', group: '演算子', pattern: /^(-|−|－)/ },
    { name: '**', group: '演算子', pattern: /^(××|\*\*|＊＊)/ },
    { name: '*', group: '演算子', pattern: /^(×|\*|＊)/ },
    { name: '÷÷', group: '演算子', pattern: '÷÷' },
    { name: '÷', group: '演算子', pattern: /^(÷|\/|／)/ },
    { name: '%', group: '演算子', pattern: /^(%|％)/ },
    { name: '^', group: '演算子', pattern: '^' },
    { name: '&', group: '演算子', pattern: /^(&|＆)/ },
    { name: '[', group: '記号', pattern: /^(\[|［)/ },
    { name: ']', group: '記号', pattern: /^(]|］)/, withJosi: true },
    { name: '(', group: '演算子', pattern: /^(\(|（)/ },
    { name: ')', group: '演算子', pattern: /^(\)|）)/, withJosi: true },
    { name: '|', group: '演算子', pattern: /^(\||｜)/ },
    { name: '」', group: '記号', pattern: '」', withJosi: true },
    { name: '』', group: '記号', pattern: '』', withJosi: true },
    { name: '{', group: '記号', pattern: /^(\{|｛)/ },
    { name: '}', group: '記号', pattern: /^(\}|｝)/, withJosi: true },
    { name: ':', group: '記号', pattern: /^(:|：)/ },
    { name: ',', group: '記号', pattern: /^(,|，|、)/ },
    { name: '。', group: '記号', pattern: /^(。)/ },
    { name: 'WORD', group: '単語', pattern: /^[\uD800-\uDBFF][\uDC00-\uDFFF][_a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]*/, withJosi: true },
    { name: 'WORD', group: '単語', pattern: /^[\u1F60-\u1F6F][_a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]*/, withJosi: true },
    { name: 'WORD', group: '単語', pattern: /^《.+?》/, withJosi: true },
    { name: 'WORD', group: '単語', pattern: /^[_a-zA-Zａ-ｚＡ-Ｚ\u3005\u4E00-\u9FCFぁ-んァ-ヶ\u2460-\u24FF\u2776-\u277F\u3251-\u32BF]/, proc: 'cbWord' },
]

export const reservedGroup: Map<Nako3TokenTypeReserve, Nako3TokenGroup> = new Map([
    ['回', '制御'],
    ['間', '制御'],
    ['繰返', '制御'],
    ['増繰返', '制御'],
    ['減繰返', '制御'],
    ['後判定', '制御'],
    ['反復', '制御'],
    ['抜ける', '制御'],
    ['続ける', '制御'],
    ['戻る', '制御'],
    ['先に', '制御'],
    ['次に', '制御'],
    ['代入', '命令'],
    ['実行速度優先', '疑似命令'],
    ['パフォーマンスモニタ適用', '疑似命令'],
    ['定める', '宣言'],
    ['逐次実行', '制御'],
    ['条件分岐', '制御'],
    ['増', '命令'],
    ['減', '命令'],
    ['変数', '宣言'],
    ['定数', '宣言'],
    ['エラー監視', '制御'],
    ['エラー', '命令'],
    ['def_func', '宣言'],
    ['インデント構文', '！命令'],
    ['非同期モード', '！命令'],
    ['DNCLモード', '！命令'],
    ['モード設定', '！命令'],
    ['取込', '！命令'],
    ['モジュール公開既定値', '！命令']
])
