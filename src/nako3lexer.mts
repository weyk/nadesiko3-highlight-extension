import reservedWords from './nako3/nako_reserved_words.mjs'
// 助詞の一覧
import { josiRE, removeJosiMap, tararebaMap } from './nako3/nako_josi_list.mjs'

import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { Nako3Command, CommandInfo } from './nako3command.mjs'
import { logger } from './logger.mjs'
import type { RuntimeEnv } from './nako3type.mjs'

export interface Indent {
    text: string
    level: number
    len: number
}

export interface Nako3Token {
    type: string
    group: string
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
}

interface ImportInfo {
    value: string
    tokenIndex: number
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

type ProcMapKey = 'cbCommentBlock'|'cbCommentLine'|'cbString'|'cbStringEx'|'cbWord'
type SubProcOptArgs = string[]
type SubProc = (text: string, indent: Indent, opts: SubProcOptArgs) => number
interface LexRule {
    name: string
    group: string
    pattern: string|RegExp
    proc?: ProcMapKey
    procArgs?: SubProcOptArgs
    isFirstCol?: boolean
    withJosi?: boolean
    withUnit?: boolean
    withToten?: boolean
} 
const kanakanji = /^[\u3005\u4E00-\u9FCF_a-zA-Z0-9ァ-ヶーａ-ｚＡ-Ｚ０-９\u2460-\u24FF\u2776-\u277F\u3251-\u32BF]+/
const hira = /^[ぁ-ん]/
const allHiragana = /^[ぁ-ん]+$/
const wordHasIjoIka = /^.+(以上|以下|超|未満)$/
const wordSpecial = /^(かつ|または)/
const unitRE = /^(円|ドル|元|歩|㎡|坪|度|℃|°|個|つ|本|冊|才|歳|匹|枚|皿|セット|羽|人|件|行|列|機|品|m|ｍ|mm|cm|ｃｍ|km|ｋｍ|g|ｇ|kg|ｋｇ|t|ｔ|px|ｐｘ|dot|ｄｏｔ|pt|ｐｔ|em|ｅｍ|b|ｂ|mb|ｍｂ|kb|ｋｂ|gb|ｇｂ)/

const spaceRE = /^( |　|\t|・|⎿|└|｜)+/

const lexRules: LexRule[] = [
    { name: 'ここまで', group: '制御', pattern: ';;;' },
    { name: 'EOL', group: '区切', pattern: '\r\n' },
    { name: 'EOL', group: '区切', pattern: '\r' },
    { name: 'EOL', group: '区切', pattern: '\n' },
    { name: 'SPACE', group: '空白', pattern: spaceRE },
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

const reservedGroup: Map<string, string> = new Map([
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

export const COL_START = 0
export const LINE_START = 0
type ProcMap = { [K in ProcMapKey]: SubProc }

interface UserFunctionInfo {
    name: string
    nameNormalized: string
    fileName: string|null
    tokenIndex: number
    isPrivate: boolean
}

export class Nako3Tokenizer {
    filename: string
    rawTokens: Nako3Token[]
    tokens: Nako3Token[]
    commentTokens: Nako3Token[]
    errorInfos: ErrorInfoManager
    userFunction: Map<string, UserFunctionInfo>
    userVariable: {[key:string]: UserFunctionInfo }
    lengthLines: number[]
    procMap: ProcMap
    line: number
    col: number
    commands: Nako3Command|null
    runtimeEnv: RuntimeEnv
    runtimeEnvDefault: RuntimeEnv
    useShebang: boolean
    pluginNames: string[]
    isIndentSemantic: boolean
    isDefaultPrivate: boolean
    imports: ImportInfo[]
    externalFunction: Map<string, UserFunctionInfo>

    constructor (filename: string) {
        this.filename = filename
        this.rawTokens = []
        this.tokens = []
        this.commentTokens = []
        this.errorInfos = new ErrorInfoManager()
        this.userFunction = new Map<string, UserFunctionInfo>()
        this.userVariable = {}
        this.externalFunction = new Map<string, UserFunctionInfo>()
        this.lengthLines = []
        this.line = 0
        this.col = 0
        this.commands = null
        this.pluginNames = []
        this.runtimeEnv = ''
        this.runtimeEnvDefault = 'wnako3'
        this.useShebang = true
        this.isIndentSemantic = false
        this.isDefaultPrivate = false
        this.imports = []
        this.procMap = {
            cbCommentBlock: this.parseBlockComment,
            cbCommentLine: this.parseLineComment,
            cbString: this.parseString,
            cbStringEx: this.parseString,
            cbWord: this.parseWord,
        }
    }

    /** 
     * 保持しているトークンや解析毛結果を削除し生トークンを生成する
     * @param text トークン化する
     */
    tokenize (text: string): void {
        this.rawTokens = []
        this.lengthLines = []
        this.errorInfos.clear()
        this.line = LINE_START
        this.col = COL_START
        this.tokenizeProc(text)
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.problemsLimit = limit
    }

    /**
     * 渡されたtextを解くんに分解して自身の保存すすｒ。
     * @param text 分析する対象の文字列を渡す            ,;.
     */
    private tokenizeProc (text: string):void {
        let indent: Indent = {
            len: 0,
            text: '',
            level: 0
        }
        while (text !== '') {
            if (this.col === COL_START) {
                if (text.startsWith(' ') || text.startsWith('　') || text.startsWith('\t')) {
                    indent = this.parseIndent(text)
                    indent.text = text.substring(0, indent.len)
                    text = text.substring(indent.len)
                    this.col += indent.len
                } else {
                    indent = {
                        len: 0,
                        text: '',
                        level: 0
                    }
                }
            }
            let token: Nako3Token = {
                type: 'UNKNOWN',
                group: '不明',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col,
                lineCount: 0,
                resEndCol: this.col,
                len: 0,
                text: '',
                value: '',
                unit: '',
                josi: '',
                indent,
            }
            let hit: boolean = false
            let len: number
            for (const rule of lexRules) {
                let r:RegExpExecArray|null = null
                if (rule.isFirstCol === true && this.col !== COL_START) {
                    continue
                }
                if (typeof rule.pattern === 'string') {
                    hit = text.startsWith(rule.pattern)
                } else {
                    r = rule.pattern.exec(text)
                    hit = r !== null
                }
                if (hit) {
                    if (rule.name === 'SPACE' && r !== null) {
                        const len = r[0].length
                        this.col += len
                        text = text.substring(len)
                        break
                    }
                    if (rule.proc) {
                        const proc:SubProc = this.procMap[rule.proc]
                        const args = rule.procArgs || []
                        const len = proc.apply(this, [text, indent, args])
                        text = text.substring(len)
                    } else {
                        token.type = rule.name
                        token.group = rule.group
                        if (typeof rule.pattern === 'string') {
                            token.len = rule.pattern.length
                        } else if (r !== null) {
                            token.len = r[0].length
                        }
                        token.resEndCol = this.col + token.len
                        token.value = text.substring(0, token.len)
                        text = text.substring(token.len)
                        if (rule.withUnit) {
                            const r = unitRE.exec(text)
                            if (r !== null) {
                                token.unitStartCol = this.col + token.len
                                token.unit = r[0]
                                token.len += token.unit.length
                                text = text.substring(token.unit.length)
                            }
                        }
                        if (rule.withJosi) {
                            // 正規表現で助詞があるか読み取る
                            const r = josiRE.exec(text)
                            if (r) {
                                token.josiStartCol = this.col + token.len
                                token.len += r[0].length
                                let josi = r[0].replace(/^\s+/, '')
                                text = text.substring(r[0].length)
                                // 助詞の直後にあるカンマを無視 #877
                                if (text.charAt(0) === ',' || text.charAt(0) === '，' || text.charAt(0) === '、' || text.charAt(0) === '。') {
                                    text = text.substring(1)
                                    token.len += 1
                                }
                                // 「＊＊である」なら削除 #939 #974
                                if (removeJosiMap[josi]) {
                                    josi = ''
                                    delete token.josiStartCol
                                }
                                // 「もの」構文 (#1614)
                                if (josi.substring(0, 2) === 'もの') {
                                    josi = josi.substring(2)
                                }
                                token.josi = josi
                            }
                        }
                        if (rule.withToten) {
                            if (text.charAt(0) === '、' || text.charAt(0) === '。') {
                                text = text.substring(1)
                                token.len += 1
                            }
                        }
                        token.endCol = this.col + token.len
                        this.col = token.endCol
                        this.rawTokens.push(token)
                    }
                    break
                }
            }
            if (!hit) {
                token.type = 'CHARACTER'
                token.endCol = this.col + 1
                token.resEndCol = token.endCol
                token.len = 1
                token.text = text.substring(0,1)
                token.value = text.substring(0,1)
                this.errorInfos.addFromToken('ERROR', 'invalidChar', { code: text.substring(0,1).codePointAt(0)!}, token)
                this.col = token.endCol
                this.rawTokens.push(token)
                len = 1
                text = text.substring(len)
            }

            if (token.type === 'EOL') {
                this.lengthLines.push(this.col)
                this.line++
                this.col = COL_START
            }
        }
    }    

    /**
     * インデントの情報を返す。tokenizeProcの下請け。
     * @param text インデントを判定するテキスト。いずれかの行の行頭のはず。
     * @returns インデントの情報。処理した文字数とインデントの深さ
     */
    private parseIndent (text: string): Indent {
        let len = 0
        let level = 0
        for (let i = 0;i < text.length; i++) {
            if (text.substring(i, i+1) === ' ') {
                len += 1
                level += 1
            } else if (text.substring(i, i+1) === '　') {
                len += 1
                level += 2
            } else if (text.substring(i, i+1) === '\t') {
                len += 1
                level = Math.floor((level + 7) / 8) * 8
            } else {
                break
            }
        }
        return { text: '', len, level }
    }

    /**
     * 行コメントのトークンを切り出す。tokenizeProcの下請け。
     * @param text 行コメントのトークンを切り出すテキスト。先頭位置が行コメントの先頭
     * @param indent 行コメントの開始行の持つインデントの情報
     * @returns トークンの切り出しによって処理済みとなった文字数
     */
    private parseLineComment (text: string, indent: Indent): number {
        const startCol = this.col
        const startTagLen = /^(#|＃|※)/.test(text) ? 1 : 2
        const r = /^[^\r\n]*/.exec(text)
        let len:number
        if (r !== null) {
            len = r[0].length
        } else {
            len = text.length
        }
        this.col += len
        const token: Nako3Token = {
            type: 'COMMENT_LINE',
            group: 'コメント',
            startLine: this.line,
            startCol,
            endLine: this.line,
            endCol: this.col,
            resEndCol : this.col,
            lineCount: 0,
            unit: '',
            josi: '',
            len,
            text: text.substring(0, len),
            value: text.substring(startTagLen, len),
            indent
        }
        this.rawTokens.push(token)
        return len
    }

    /**
     * ブロックコメントのトークンを切り出す。tokenizeProcの下請け。
     * @param text ブロックコメントのトークンを切り出すテキスト。先頭位置がブロックコメントの先頭
     * @param indent ブロックコメントの開始行の持つインデントの情報
     * @param opts 開始タグ、終了タグの配列。
     * @returns トークンの切り出しによって処理済みとなった文字数
     */
    private parseBlockComment (text: string, indent: Indent, opts: SubProcOptArgs): number {
        const startLine = this.line
        const startCol = this.col
        const startTag = opts[0]
        const endTag = opts[1]
        const index = text.indexOf(endTag, startTag.length)
        const len = index >= 0 ? index + endTag.length : startTag.length
        let comment = text.substring(0, len)
        let lineCount = 0
        let endCol = this.col
        if (index >= 0) {
            lineCount = this.skipWithoutCrlf(comment)
            endCol = this.col
        } else {
            this.errorInfos.add('ERROR', 'unclosedBlockComment', {} , startLine, startCol, startLine, startCol + startTag.length)
            endCol = endCol + startTag.length
        }
        this.col = endCol
        const token: Nako3Token = {
            type: 'COMMENT_BLOCK',
            group: 'コメント',
            startLine,
            startCol,
            endLine: this.line,
            endCol,
            resEndCol : endCol,
            lineCount,
            len,
            unit: '',
            josi: '',
            text: text.substring(0, len),
            value: text.substring(startTag.length, len - (index >= 0 ? endTag.length : 0)),
            indent,
        }
        this.rawTokens.push(token)
        return len
    }

    /**
     * 文字列のトークンを切り出す。tokenizeProcの下請け。
     * @param text 文字列のトークンを切り出すテキスト。先頭位置が文字列の先頭
     * @param indent 文字列の開始行の持つインデントの情報
     * @param opts 開始タグ、終了タグ、文字列の種類の配列。
     * @returns トークンの切り出しによって処理済みとなった文字数
     */
    private parseString (text: string, indent: Indent, opts: SubProcOptArgs): number {
        // console.log(`stringex: enter(col=${this.col})`)
        let startLine = this.line
        let startCol = this.col
        const startTag = opts[0]
        const endTag = opts[1]
        const type = opts[2]
        const index = text.indexOf(endTag, startTag.length)
        let lastPartIndex = 0
        let len = index >= 0 ? index + endTag.length : startTag.length
        let str = text.substring(0, len)
        let lineCount = 0
        let endCol = this.col
        let isFirstStringPart = true
        let hasInject = false
        const checkIndex = str.indexOf(startTag, startTag.length)
        if (startTag !== endTag && checkIndex >= 0) {
            this.errorInfos.add('WARN', 'stringInStringStartChar', { startTag }, startLine, startCol, startLine, startCol + startTag.length)
        }
        if (index >= 0) {
            let parenIndex = type === 'STRING_EX' ? str.search(/[\{｛]/) :  -1
            while (str !== '') {
                if (parenIndex >= 0) {
                    hasInject = true
                    let stringpart = str.substring(0, parenIndex)
                    lineCount = this.skipWithoutCrlf(stringpart)
                    const token: Nako3Token = {
                        type: type,
                        group :'文字列',
                        startLine,
                        startCol,
                        endLine: this.line,
                        endCol: this.col,
                        resEndCol: this.col,
                        lineCount,
                        len: parenIndex + (isFirstStringPart ? startTag.length : 0),
                        unit: '',
                        josi: '',
                        text: str.substring(0, parenIndex),
                        value: str.substring(isFirstStringPart ? startTag.length : 0, parenIndex),
                        indent,
                    }
                    this.rawTokens.push(token)
                    str = str.substring(parenIndex)
                    isFirstStringPart = false
                    const parenStartTag = str.charAt(0)
                    const parenEndTag = parenStartTag === '{' ? '}' : '｝'
                    let parenIndexEnd = str.indexOf(parenEndTag)
                    if (parenIndexEnd !== -1) {
                        let token: Nako3Token
                        // "{" mark
                        token = {
                            type: 'STRING_INJECT_START',
                            group: '記号',
                            startLine: this.line,
                            startCol: this.col,
                            endLine: this.line,
                            endCol: this.col + 1,
                            resEndCol: this.col + 1,
                            lineCount: 0,
                            len: 1,
                            unit: '',
                            josi: '',
                            text: parenStartTag,
                            value: parenStartTag,
                            indent,
                        }
                        this.rawTokens.push(token)
                        this.col++
                        const strex = str.substring(1, parenIndexEnd)
                        this.tokenizeProc(strex)
                        // "}" mark
                        token = {
                            type: 'STRING_INJECT_END',
                            group: '記号',
                            startLine: this.line,
                            startCol: this.col,
                            endLine: this.line,
                            endCol: this.col + 1,
                            resEndCol: this.col + 1,
                            lineCount: 0,
                            len: 1,
                            unit: '',
                            josi: '',
                            text: parenEndTag,
                            value: parenEndTag,
                            indent,
                        }
                        this.rawTokens.push(token)
                        this.col++
                        str = str.substring(parenIndexEnd + 1) // 1 for "}" length
                        lastPartIndex += parenIndex + parenIndexEnd + 1 // 1 for "}" length
                        startLine = this.line
                        startCol = this.col
                        endCol = this.col
                        parenIndex = str.search(/[\{｛]/)
                    } else {
                        this.errorInfos.add('ERROR', 'unclosedPlaceHolder', {},  this.line, this.col, this.line, this.col + 1)
                        parenIndex = -1
                    }
                } else {
                    // no paren peair
                    lineCount = this.skipWithoutCrlf (str)
                    endCol = this.col
                    str = ''
                }
            }
        } else {
            this.errorInfos.add('ERROR', 'unclosedString', {},  startLine, startCol, startLine, startCol + startTag.length)
            endCol = endCol + startTag.length
        }
        const resEndCol = endCol
        const resLen = len - lastPartIndex
        let josiStartCol:number|undefined
        const r = josiRE.exec(text.substring(len))
        let josi = ''
        if (r) {
            josiStartCol = endCol
            josi = r[0].replace(/^\s+/, '')
            len += r[0].length
            endCol += r[0].length
            if (text.charAt(len) === ',' || text.charAt(len) === '，' || text.charAt(len) === '、' || text.charAt(len) === '。') {
                len += 1
                endCol += 1
            }
        }
        // 「もの」構文 #1614
        if (josi.startsWith('もの')) {
            josi = josi.substring(2)
        }
        // 助詞「こと」「である」「です」などは「＊＊すること」のように使うので削除 #936 #939 #974
        if (removeJosiMap[josi]) {
            josi = ''
            josiStartCol = undefined
        }
        this.col = endCol
        const token: Nako3Token = {
            type: hasInject ? type: 'STRING',
            group: '文字列',
            startLine,
            startCol,
            endLine: this.line,
            endCol,
            resEndCol,
            lineCount,
            len: len - lastPartIndex,
            unit: '',
            josi,
            josiStartCol,
            text: text.substring(isFirstStringPart ? 0 : lastPartIndex, len),
            value: text.substring(isFirstStringPart ? startTag.length : lastPartIndex, resLen + lastPartIndex - (index >= 0 ? endTag.length : 0)),
            indent,
        }
        this.rawTokens.push(token)
        // console.log(`stringex: leave(col=${this.col})`)
        return len
    }

    /**
     * 改行を判定しcol/lineを更新する。複数行のparse系の下請け。
     * @param str 処理する対象の文字列。
     * @returns 行数を返す。
     */
    private skipWithoutCrlf (str: string): number {
        let lineCount = 0
        let endCol = this.col
        while (str !== '') {
            let crlfIndex = str.search(/[\r\n]/)
            if (crlfIndex >= 0) {
                // console.log(`stringEx: crlf loigc:${crlfIndex}`)
                let crlfLen = 1
                if (str.length > 1 && str.charAt(crlfIndex) === '\r' && str.charAt(crlfIndex + 1) === '\n') {
                    crlfLen = 2
                }
                lineCount ++
                endCol += crlfIndex
                this.lengthLines.push(endCol)
                endCol = COL_START
                str = str.substring(crlfIndex + crlfLen)
            } else {
                endCol += str.length
                str = ''
            }
        }
        this.line += lineCount
        this.col = endCol
        return lineCount
    }

    /**
     * 単語のトークンを切り出す。tokenizeProcの下請け。
     * @param text 単語のトークンを切り出すテキスト。先頭位置が単語の先頭
     * @param indent 単語のある行の持つインデントの情報
     * @param opts 無し。他の関数との互換性の為に存在。
     * @returns トークンの切り出しによって処理済みとなった文字数
     */
    private parseWord (text: string, indent: Indent, opts: SubProcOptArgs): number {
        const startCol = this.col
        const r = /^[^\r\n]*/.exec(text)
        let line = r ? r[0] : ''
        let len = 0
        let resLen = 0
        let josi = ''
        let josiStartCol = undefined
        while (line !== '') {
            if (resLen > 0) {
                if (wordSpecial.test(line)) {
                    break
                }
                const r = josiRE.exec(line)
                if (r) {
                    josiStartCol = this.col + resLen
                    len = resLen
                    josi = r[0].replace(/^\s+/, '')
                    len += r[0].length
                    line = line.substring(r[0].length)
                    if (line.charAt(0) === ',' || line.charAt(0) === '，' || line.charAt(0) === '、' || line.charAt(0) === '。') {
                        len += 1
                        line = line.substring(1)
                    }
                    break
                }
            }
            const k = kanakanji.exec(line)
            if (k) {
                resLen += k[0].length
                line = line.substring(k[0].length)
                continue
            }
            const h = hira.test(line)
            if (h) {
                resLen += 1
                line = line.substring(1)
                continue
            }
            break
        }
        if (len === 0 && resLen > 0) {
            len = resLen
            if (line.charAt(0) === '、' || line.charAt(0) === '。') {
                len += 1
                line = line.substring(1)
            }
        }
        let res = text.substring(0, resLen)
        // --- 単語分割における特殊ルール ---
        // 「間」の特殊ルール (#831)
        // 「等しい間」や「一致する間」なら「間」をsrcに戻す。ただし「システム時間」はそのままにする。
        if (/[ぁ-ん]間$/.test(res)) {
            line = res.charAt(res.length - 1) + line
            len -= 1
            resLen -= 1
            res = res.slice(0, -1)
            if (typeof josiStartCol !== 'undefined') {
                josiStartCol -= 1
            }
        }
        // 「以上」「以下」「超」「未満」 #918
        const ii = wordHasIjoIka.exec(res)
        if (ii) {
            resLen -= ii[1].length
            len = resLen
            josi = ''
            josiStartCol = undefined
            res = res.slice(0, - ii[1].length)
        }
          // 「もの」構文 #1614
        if (josi.startsWith('もの')) {
            josi = josi.substring(2)
        }
        // 助詞「こと」「である」「です」などは「＊＊すること」のように使うので削除 #936 #939 #974
        if (removeJosiMap[josi]) {
            josi = ''
            josiStartCol = undefined
        }
        // 助詞だけの語句の場合
        if (res === '' && josi !== '') {
            res = josi
            josi = ''
        }
        this.col += len
        const token: Nako3Token = {
            type: 'WORD',
            group: '単語',
            startLine: this.line,
            startCol,
            endLine: this.line,
            endCol: this.col,
            resEndCol: startCol + resLen,
            lineCount: 0,
            len,
            text: text.substring(0, len),
            value: res,
            unit: '',
            josi,
            josiStartCol,
            indent,
        }
        this.rawTokens.push(token)
        return len
    }

    trimOkurigana (str: string): string {
        // ひらがなから始まらない場合、送り仮名を削除。(例)置換する
        if (!hira.test(str)) {
            return str.replace(/[ぁ-ん]+/g, '')
        }
        // 全てひらがな？ (例) どうぞ
        if (allHiragana.test(str)) { return str }
        // 末尾のひらがなのみ (例)お願いします →お願
        return str.replace(/[ぁ-ん]+$/g, '')
    }

    fixTokens ():void {
        this.tokens = []
        this.commentTokens = []
        this.isIndentSemantic = false
        this.isDefaultPrivate = false
        this.runtimeEnv = this.runtimeEnvDefault
        this.imports = []
        let token:Nako3Token
        let rawToken:Nako3Token|null = null
        let reenterToken:Nako3Token[] = []
        const functionIndex:number[] = []
        const preprocessIndex: number[] = []
        let topOfLine = true
        let isLine0Col0 = true
        for (let i = 0; i < this.rawTokens.length;) {
            if (reenterToken.length > 0) {
                rawToken = reenterToken.shift()!
            } else {
                rawToken = this.rawTokens[i]
                i++
            }
            token = Object.assign({}, rawToken)
            let requirePush = true
            let type = rawToken.type
            // 「回」で終わるWORDから「回」を分離する。
            if (type === 'WORD' && rawToken.josi === '' && rawToken.value.length >= 2) {
                if (rawToken.value.match(/回$/)) {
                    token = Object.assign({}, rawToken, {
                        type,
                        value : rawToken.value.slice(0, -1),
                        text : rawToken.text.slice(0, -1),
                        len : rawToken.len - 1,
                        endCol : rawToken.endCol - 1,
                        resEndCol: rawToken.resEndCol - 1,
                    })
                    reenterToken.push(token)
                    token = Object.assign({}, rawToken, {
                        startCol: rawToken.endCol - 1,
                        endCol: rawToken.endCol,
                        resEndCol: rawToken.endCol,
                        len: 1,
                        type: '回',
                        group: '制御',
                        text: '回',
                        value: '回',
                    })
                    reenterToken.push(token)
                    requirePush = false
                    continue
                }
            }
            if (typeof rawToken.josi === 'undefined') {
                token.josi = ''
            }
            if ((rawToken.josi === 'には' || rawToken.josi === 'は~' || rawToken.josi === 'は～') && typeof rawToken.josiStartCol === 'number') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.josiStartCol,
                    text: rawToken.text.slice(0, - (rawToken.len - rawToken.josiStartCol!)),
                    endCol: rawToken.josiStartCol,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'には',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol,
                    josi: '',
                    josiStartCol: null,
                    text: rawToken.text.substring(rawToken.len - rawToken.josiStartCol),
                    value: 'には',
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (rawToken.josi === 'は') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.len - 1,
                    text: rawToken.text.slice(0, -1),
                    endCol: rawToken.endCol - 1,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'EQ',
                    group: '演算子',
                    len: 1,
                    text: '=',
                    value: '=',
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.endCol - 1,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (rawToken.josi === 'とは' && typeof rawToken.josiStartCol === 'number') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.josiStartCol,
                    text: rawToken.text.slice(0, - (rawToken.len - rawToken.josiStartCol)),
                    endCol: rawToken.josiStartCol,
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'とは',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol!,
                    josi: '',
                    josiStartCol: null,
                    text: rawToken.text.substring(rawToken.len - rawToken.josiStartCol),
                    value: 'とは',
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.endCol,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (tararebaMap[rawToken.josi] && typeof rawToken.josiStartCol === 'number') {
                const rawJosi = rawToken.josi
                const josi = (rawJosi === 'でなければ' || rawJosi === 'なければ') ? 'でなければ' : 'ならば'
                token = Object.assign({}, rawToken, {
                    type,
                    len: rawToken.len - rawJosi.length,
                    text: rawToken.text.slice(0, - (rawToken.endCol - rawToken.josiStartCol)),
                    endCol: rawToken.josiStartCol,
                    josiStartCol: null,
                    josi: '',
                })
                reenterToken.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'ならば',
                    group: '制御',
                    len: rawToken.len - rawToken.josiStartCol,
                    text: rawJosi,
                    value: josi,
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.josiStartCol + rawJosi.length,
                })
                reenterToken.push(token)
                requirePush = false
            }
            if (requirePush) { 
                if ((type === 'def_func' || type === '*') && rawToken.startCol === 0 && rawToken.josi === '') {
                    functionIndex.push(this.tokens.length)
                    if (type === '*') {
                        console.log(`tokenize: function start with token-type '*'. not 'def_fund'`)
                    }
                } else if (type === 'には') {
                    functionIndex.push(this.tokens.length)
                }
                token.type = type
                if (type === 'COMMENT_LINE' || type === 'COMMENT_BLOCK') {
                    if (isLine0Col0 && type === 'COMMENT_LINE') {
                        if (this.useShebang && token.text.startsWith('#!')) {
                            if (token.text.includes('snako')) {
                                this.runtimeEnv = 'snako'
                            } else if (token.text.includes('cnako')) {
                                this.runtimeEnv = 'cnako3'
                            }
                        }
                    }
                    this.commentTokens.push(token)
                } else {
                    if (token.type === 'EOL') {
                        topOfLine = true
                    } else {
                        if (topOfLine && token.type === 'NOT') {
                            preprocessIndex.push(this.tokens.length)
                        }
                        topOfLine = false
                    }
                    this.tokens.push(token)
                }
                isLine0Col0 = false
            }
        }
        this.preprocess(preprocessIndex)
        this.enumlateFunction(functionIndex)
    }

    preprocess (preprocessIndex: number[]):void {
        let token: Nako3Token
        const tokens = this.tokens
        const tokenCount = tokens.length
        for (const index of preprocessIndex) {
            let causeError = false
            let i = index
            token = tokens[i]
            if (!(token.type === 'NOT' && (token.value === '!' || token.value === '！'))) {
                logger.log(`internal error: invalid token, expected 'NOT' token`)                
            }
            i++
            token = tokens[i]
            if (token.type === 'STRING_EX') {
                this.errorInfos.addFromToken('ERROR', `cannotUseTemplateString`, {}, token)
                causeError = true
            } else if (token.type === 'インデント構文' || (token.type === 'WORD' && token.value === 'インデント構文')) {
                this.isIndentSemantic = true
                logger.info('indent semantic on')
            } else if (token.type === 'モジュール公開既定値' || (token.type === 'WORD' && token.value === 'モジュール公開既定値')) {
                i++
                token = tokens[i]
                if (token.type === 'EQ') {
                    i++
                    token = tokens[i]
                    if (token.type === 'STRING') {
                        this.isDefaultPrivate = token.value === '非公開'
                        logger.info(`change default publishing:${token.value}`)
                    } else if (token.type === 'STRING_EX') {
                        this.errorInfos.addFromToken('ERROR', `cannotUseTemplateString`, {}, token)
                        causeError = true
                    } else {
                        this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocess`, { type: token.type, value: token.value }, token)
                        causeError = true
                    }
                } else {
                    this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocessExpected`, { expected:'=', type: token.type, value: token.value }, token)
                    causeError = true
                }
            } else if (i+1 < tokenCount && token.type === 'STRING' && token.josi === 'を' && (tokens[i+1].type === '取込' || (tokens[i+1].type === 'WORD' && this.trimOkurigana(tokens[i+1].value) === '取込'))) {
                const importInfo: ImportInfo = {
                    value: token.value,
                    tokenIndex: i,
                    startLine: tokens[i-1].startLine,
                    startCol: tokens[i-1].startCol,
                    endLine: tokens[i+1].endLine,
                    endCol: tokens[i+1].endCol
                }
                this.imports.push(importInfo)
                i += 1
            }
            if (!causeError) {
                i++
                token = tokens[i]
                if (!(token.type === 'EOL')) {
                    this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocessExpected`, { expected:'EOL', type: token.type, value: token.value }, token)
                }
            }
        }
    }

    enumlateFunction (functionIndex: number[]):void {
        const parseArguments = (i:number):number => {
            // jに先頭位置、iに最短の')'またはEOLの位置を求める。
            let j = i
            for (;i < this.tokens.length && this.tokens[i].type !== ')' && this.tokens[i].type !== 'EOL';i++) {
                //
            }
            if (this.tokens[i].type === ')') {
                for (;j <= i;j++) {
                    token = this.tokens[j]
                    if (token.type === ',' || token.type === '|') {
                        token.type = 'FUNCTION_ARG_SEPARATOR'
                    } else if (token.type === '(' || token.type === ')') {
                        token.type = 'FUNCTION_ARG_PARENTIS'
                    } else if (token.type === 'WORD') {
                        token.type = 'FUNCTION_ARG_PARAMETER'
                    } else {
                        this.errorInfos.addFromToken('ERROR', 'unknownTokenInFuncParam', {type: token.type}, token)
                    }
                }
                i++
            } else {
                this.errorInfos.addFromToken('ERROR', 'noFunctionParamParentisR', {token:this.tokens[j].type}, this.tokens[j])
            }
            return i
        }
        let token: Nako3Token
        for (const index of functionIndex) {
            let i = index
            let isMumei = false
            let isPrivate = this.isDefaultPrivate
            token = this.tokens[i]
            if (token.type === '*') {
                token.type = 'def_func'
            }
            if (token.type === 'には') {
                isMumei = true
            }
            i++
            token = this.tokens[i]
            if (!isMumei && token.type === '{') {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 let j = i
                for (;i < this.tokens.length && this.tokens[i].type !== '}' && this.tokens[i].type !== 'EOL';i++) {
                    //
                }
                if (this.tokens[i].type === '}') {
                    for (;j <= i;j++) {
                        token = this.tokens[j]
                        token.type = 'FUNCTION_ATTRIBUTE'
                    }
                    if (this.tokens[i-1].value === '非公開') {
                        isPrivate = true
                    }
                    i++
                }
            }
            let hasParameter = false
            token = this.tokens[i]
            if (token.type === '(') {
                i = parseArguments(i)
                hasParameter = true
            }
            token = this.tokens[i]
            let hasToha = false
            if (!isMumei && token.type === 'WORD') {
                token.type = 'FUNCTION_NAME'
                this.addUserFunction(token.value, isPrivate, index)
                if (token.josi === 'とは') {
                    hasToha = true
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasToha && (token.type === 'とは' || (token.type === 'WORD' && token.value === 'とは'))) {
                if (token.type === 'WORD' && token.value === 'とは') {
                    console.warn(`とは type was WORD`)
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasParameter && token.type === '(') {
                i = parseArguments(i)
                hasParameter = true
            }
        }
    }

    addUserFunction (name: string, isPrivate: boolean, index: number):void {
        const nameTrimed = name.trim()
        const nameNormalized = this.trimOkurigana(nameTrimed)
        this.userFunction.set(nameNormalized, {
            name: nameTrimed,
            nameNormalized: nameNormalized,
            fileName: null,
            isPrivate,
            tokenIndex: index
        })
    }

    applyFunction() {
        for (const token of this.tokens) {
            const v = token.value
            const tv = this.trimOkurigana(v)
            let type = token.type
            if (type === 'WORD') {
                const rtype = this.userFunction.get(tv)
                if (rtype) {
                    type = 'ユーザー関数'
                    token.type = type
                }
            }
            if (type === 'WORD') {
                const rtype = reservedWords.get(v) || reservedWords.get(tv)
                if (rtype) {
                    type = rtype
                    token.type = type
                    token.group = reservedGroup.get(type)!
                }
                if (token.value === 'そう') {
                    token.value = 'それ'
                }
            }
            if (type === 'WORD' && this.commands) {
                const commandInfo = this.getCommandInfo(v)
                if (commandInfo) {
                    type = commandInfo.type
                    token.type = type
                }
            }
        }
    }

    getCommandInfo (command: string): CommandInfo|null {
        const tv = this.trimOkurigana(command)
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
}
