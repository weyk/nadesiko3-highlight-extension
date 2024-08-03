import * as vscode from 'vscode'

import reservedWords from './nako3/nako_reserved_words.mjs'
// 助詞の一覧
import { josiRE, removeJosiMap, tararebaMap } from './nako3/nako_josi_list.mjs'
import commandjson from './nako3/command.json'

const NAKO3_MODE = { scheme: 'file', language: 'nadesiko3' }

const tokenTypes = ['function', 'variable', 'comment', 'string', 'number', 'keyword', 'operator', 'type', 'parameter', 'decorator']
const tokenModifiers = ['declaration', 'documentation', 'defaultLibrary', 'deprecated', 'readonly'];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers)

interface Indent {
    text: string
    level: number
    len: number
}
interface Nako3Token {
    type: string
    len: number
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    lineCount: number
    text: string
    value: string
    resEndCol: number
    unit?: string
    unitStartCol?: number
    josi?: string
    josiStartCol?: number
}

type ProcMapKey = 'cbCommentBlock'|'cbCommentLine'|'cbFunctionDeclare'|'cbString'|'cbStringEx'|'cbWord'
type SubProcOptArgs = string[]
type SubProc = (text: string, opts:SubProcOptArgs) => number
interface LexRule {
    name: string
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

const hilightMapping = {
    NUMBER_EX: 'number',
    NUMBER: 'number',
    COMMENT_LINE: 'comment',
    COMMENT_BLOCK: 'comment',
    STRING_EX: 'string',
    STRING: 'string',
    FUNCTION_DECLARE: 'keyword',
    FUNCTION_ARGSTRING: 'parameter',
    FUNCTION_ATTRIBUTE: 'decorator',
    FUNCTION_NAME: ['function', 'declaration'],
    システム定数: ['variable', ['defaultLibrary', 'readonly']],
    システム関数: ['function', ['defaultLibrary']],
    システム変数: ['variable', ['defaultLibrary']],
    ユーザー関数: 'function',
    ここから: 'keyword',
    ここまで: 'keyword',
    もし: 'keyword',
    ならば: 'keyword',
    違えば: 'keyword',
    とは: 'keyword',
    回: 'keyword',
    間: 'keyword',
    繰返: 'keyword',
    増繰返: 'keyword',
    減繰返: 'keyword',
    後判定: 'keyword',
    反復: 'keyword',
    抜ける: 'keyword',
    続ける: 'keyword',
    戻る: 'keyword',
    先に: 'keyword',
    次に: 'keyword',
    実行速度優先: 'keyword',
    パフォーマンスモニタ適用: 'keyword',
    定める: 'keyword',
    条件分岐: 'keyword',
    増: 'keyword',
    減: 'keyword',
    変数: 'type',
    定数: 'type',
    エラー監視: 'keyword',
    エラー: 'keyword',
    インデント構文: 'keyword',
    DNCLモード: 'keyword',
    モード設定: 'keyword',
    取込: 'keyword',
    モジュール公開既定値: 'keyword',
    逐次実行: ['keyword', ['deprecated']],
    SHIFT_R0: 'operator',
    SHIFT_R: 'operator',
    SHIFT_L: 'operator',
    GE: 'operator',
    LE: 'operator',
    NE: 'operator',
    EQ: 'operator',
    GT: 'operator',
    LT: 'operator',
    NOT: 'operator',
    AND: 'operator',
    OR: 'operator',
    '+': 'operator',
    '-': 'operator',
    '**': 'operator',
    '*': 'operator',
    '@': 'operator',
    '÷÷': 'operator',
    '÷': 'operator',
    '%': 'operator',
    '^': 'operator',
    '&': 'operator',
    ':': 'operator',
    'def_func': 'keyword',
}

const spaceRE = /^(\x20|\x09|・|⎿|└|｜)+/

const lexRules: LexRule[] = [
    { name: 'ここまで', pattern: ';;;' },
    { name: 'EOL', pattern: '\r\n' },
    { name: 'EOL', pattern: '\r' },
    { name: 'EOL', pattern: '\n' },
    { name: 'SPACE', pattern: spaceRE },
    { name: 'NUMBER_EX', pattern: /^0[xX][0-9a-fA-F]+(_[0-9a-fA-F]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^0[oO][0-7]+(_[0-7]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^0[bB][0-1]+(_[0-1]+)*n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^\d+(_\d+)*?n/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^０[ｘＸ][０-９ａ-ｆＡ-Ｆ]+([_＿][０-９ａ-ｆＡ-Ｆ]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^０[ｏＯ][０-７]+([_＿][０-７]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^０[ｂＢ][０１]+([_＿][０１]+)*[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER_EX', pattern: /^[０-９]+([_＿][０-９]+)*?[nｎ]/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^0[xX][0-9a-fA-F]+(_[0-9a-fA-F]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^0[oO][0-7]+(_[0-7]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^0[bB][0-1]+(_[0-1]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^\d+(_\d+)*\.(\d+(_\d+)*)?([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^\.\d+(_\d+)*([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^\d+(_\d+)*([eE][+|-]?\d+(_\d+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^０[ｘＸ][０-９ａ-ｆＡ-Ｆ]+([_＿][０-９ａ-ｆＡ-Ｆ]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^０[ｏＯ][０-７]+([_＿][０-７]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^０[ｂＢ][０１]+([_＿][０１]+)*/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^[０-９]+([_＿][０-９]+)*[\.．]([０-９]+([_＿][０-９]+)*)?([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^[\.．][０-９]+([_＿][０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^[０-９]+(_[０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'COMMENT_LINE', pattern: /^(#|＃|\/\/|／／)/, proc: 'cbCommentLine' },
    { name: 'COMMENT_BLOCK', pattern: '/*', proc: 'cbCommentBlock', procArgs: ['/*', '*/']  },
    { name: 'COMMENT_BLOCK', pattern: '／＊', proc: 'cbCommentBlock', procArgs: ['／＊', '＊／'] },
    { name: 'func_def', pattern: '●', isFirstCol: true, proc: 'cbFunctionDeclare'},
    { name: 'STRING', pattern: '\'', proc: 'cbString', procArgs: ['\'', '\'', 'STRING'] },
    { name: 'STRING', pattern: '’', proc: 'cbString', procArgs: ['’', '’', 'STRING'] },
    { name: 'STRING', pattern: '『', proc: 'cbString', procArgs: ['『', '』', 'STRING'] },
    { name: 'STRING', pattern: '🌿', proc: 'cbString', procArgs: ['🌿', '🌿', 'STRING'] },
    { name: 'STRING_EX', pattern: '"', proc: 'cbStringEx', procArgs: ['"', '"', 'STRING_EX'] },
    { name: 'STRING_EX', pattern: '”', proc: 'cbStringEx', procArgs: ['”', '”', 'STRING_EX'] },
    { name: 'STRING_EX', pattern: '「', proc: 'cbStringEx', procArgs: ['「', '」', 'STRING_EX'] },
    { name: 'STRING_EX', pattern: '“', proc: 'cbStringEx', procArgs: ['“', '”', 'STRING_EX'] },
    { name: 'STRING_EX', pattern: '🌴', proc: 'cbStringEx', procArgs: ['🌴', '🌴', 'STRING_EX'] },
    { name: 'ここから', pattern: 'ここから' },
    { name: 'ここまで', pattern: 'ここまで' },
    { name: 'ここまで', pattern: '💧' },
    { name: 'もし', pattern: /^もしも?/, withToten: true },
    { name: '違えば', pattern: /^違(えば)?/, withToten: true },
    { name: 'SHIFT_R0', pattern: /^(>>>|＞＞＞)/ },
    { name: 'SHIFT_R', pattern: /^(>>|＞＞)/ },
    { name: 'SHIFT_L', pattern: /^(<<|＜＜)/ },
    { name: 'GE', pattern: /^(≧|>=|=>|＞＝|＝＞)/ },
    { name: 'LE', pattern: /^(≦|<=|=<|＜＝|＝＜)/ },
    { name: 'NE', pattern: /^(≠|<>|!=|＜＞|！＝)/ },
    { name: 'EQ', pattern: /^(==?|＝＝?)/ },
    { name: 'NOT', pattern: /^(!|💡|！)/ },
    { name: 'GT', pattern: /^(>|＞)/ },
    { name: 'LT', pattern: /^(<|＜)/ },
    { name: 'AND', pattern: /^(かつ|&&|and\s)/ },
    { name: 'OR', pattern: /^(または|或いは|あるいは|or\s|\|\|)/ },
    { name: '@', pattern: /^(@|＠)/ },
    { name: '+', pattern: /^(\+|＋)/ },
    { name: '-', pattern: /^(-|－)/ },
    { name: '**', pattern: /^(××|\*\*|＊＊)/ },
    { name: '*', pattern: /^(×|\*|＊)/ },
    { name: '÷÷', pattern: '÷÷' },
    { name: '÷', pattern: /^(÷|\/|／)/ },
    { name: '%', pattern: /^(%|％)/ },
    { name: '^', pattern: '^' },
    { name: '&', pattern: /^(&|＆)/ },
    { name: '[', pattern: /^(\[|［)/ },
    { name: ']', pattern: /^(]|］)/, withJosi: true },
    { name: '(', pattern: /^(\(|（)/ },
    { name: ')', pattern: /^(\)|）)/, withJosi: true },
    { name: '|', pattern: /^(\||｜)/ },
    { name: '」', pattern: '」', withJosi: true },
    { name: '』', pattern: '』', withJosi: true },
    { name: '{', pattern: /^(\{|｛)/ },
    { name: '}', pattern: /^(\}|｝)/, withJosi: true },
    { name: ':', pattern: /^(:|：)/ },
    { name: ',', pattern: /^(,|，|、)/ },
    { name: 'WORD', pattern: /^[\uD800-\uDBFF][\uDC00-\uDFFF][_a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]*/, withJosi: true },
    { name: 'WORD', pattern: /^[\u1F60-\u1F6F][_a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]*/, withJosi: true },
    { name: 'WORD', pattern: /^《.+?》/, withJosi: true },
    { name: 'WORD', pattern: /^[_a-zA-Zａ-ｚＡ-Ｚ\u3005\u4E00-\u9FCFぁ-んァ-ヶ\u2460-\u24FF\u2776-\u277F\u3251-\u32BF]/, proc: 'cbWord' },
]

let commandlist = {}
for (const pluginname of Object.keys(commandjson)) {
    const plugin = commandjson[pluginname]
    for (const sectioname of Object.keys(plugin)) {
        const section = plugin[sectioname]
        for (const entry of section) {
            let type = entry[0]
            const name = entry[1]
            if (type === '定数') {
                type = 'システム定数'
            } else if (type === '関数') {
                type = 'システム関数'
            } else if (type === '変数') {
                type = 'システム変数'
            }
            commandlist[name] = type
        }
    }
}
const COL_START = 0;
const LINE_START = 0;
type ProcMap = { [K in ProcMapKey]: SubProc };
class Nako3Tokenizer {
    filename: string
    rawTokens: Nako3Token[]
    tokens: Nako3Token[]
    userFunction: {}
    userVariable: {}
    lengthLines: number[]
    procMap: ProcMap
    line: number
    col: number
    constructor (filename: string) {
        this.filename = filename
        this.rawTokens = []
        this.tokens = []
        this.userFunction = {}
        this.userVariable = {}
        this.lengthLines = []
        this.line = 0
        this.col = 0
        this.procMap = {
            cbCommentBlock: this.parseBlockComment,
            cbCommentLine: this.parseLineComment,
            cbFunctionDeclare: this.parseFunctionDeclare,
            cbString: this.parseString,
            cbStringEx: this.parseString,
            cbWord: this.parseWord,
        }
    }

    tokenize (text: string):void {
        this.rawTokens = []
        this.line = LINE_START;
        this.col = COL_START;
        let indent: Indent;
        while (text !== '') {
            if (this.col === COL_START) {
                if (text.startsWith(' ') || text.startsWith('　') || text.startsWith('\t')) {
                    indent = this.parseIndent(text);
                    indent.text = text.substring(0, indent.len);
                    text = text.substring(indent.len);
                    this.col += indent.len;
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
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: null,
                lineCount: 0,
                resEndCol: this.col,
                len: 0,
                text: '',
                value: '',
                unit: '',
                josi: '',
            }
            let hit: boolean = false
            let len: number
            for (const rule of lexRules) {
                let r:RegExpExecArray = null
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
                    if (rule.name === 'SPACE') {
                        const len = r[0].length
                        this.col += len
                        text = text.substring(len)
                        break
                    }
                    if (rule.proc) {
                        const proc:SubProc = this.procMap[rule.proc]
                        const len = proc.apply(this, [text, rule.procArgs])
                        text = text.substring(len)
                    } else {
                        token.type = rule.name
                        if (typeof rule.pattern === 'string') {
                            token.len = rule.pattern.length
                        } else {
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
                                if (text.charAt(0) === ',' || text.charAt(0) === '，' || text.charAt(0) === '、') {
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
                            if (text.charAt(0) === '、') {
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
                // console.log(`character:${text.substring(0,1).codePointAt(0)}`)
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

    parseIndent (text: string): Indent {
        let len = 0;
        let level = 0;
        for (let i = 0;i < text.length; i++) {
            if (text.substring(i, i+1) === ' ') {
                len += 1;
                level += 1;
            } else if (text.substring(i, i+1) === '　') {
                len += 1;
                level += 2;
            } else if (text.substring(i, i+1) === '\t') {
                len += 1;
                level = Math.floor((level + 7) / 8) * 8;
            } else {
                break;
            }
        }
        return { text: null, len, level }
    }

    parseLineComment (text: string): number {
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
            startLine: this.line,
            startCol,
            endLine: this.line,
            endCol: this.col,
            resEndCol : this.col,
            lineCount: 0,
            len,
            text: text.substring(0, len),
            value: text.substring(startTagLen, len)
        }
        this.rawTokens.push(token)
        return len
    }

    parseBlockComment (text: string, opts: SubProcOptArgs): number {
        const startLine = this.line
        const startCol = this.col
        const startTag = opts[0]
        const endTag = opts[1]
        const index = text.indexOf(endTag, startTag.length)
        const len = index >= 0 ? index + endTag.length : text.length
        let comment = text.substring(0, len)
        let lineCount = 0
        let endCol = null
        while (comment !== '') {
            const crIndex = comment.indexOf('\r');
            const lfIndex = comment.indexOf('\n');
            if (crIndex !== -1 && lfIndex !== -1 && crIndex + 1 === lfIndex) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                comment = comment.substring(crIndex + 2);
            } else if (crIndex !== -1 && ((lfIndex !== -1 && crIndex < lfIndex) || lfIndex === -1)) {
                lineCount ++
                endCol = crIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                comment = comment.substring(crIndex + 1)
            } else if (lfIndex !== -1 && ((crIndex !== -1 && lfIndex <= crIndex) || crIndex === -1)) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                comment = comment.substring(lfIndex + 1)
            } else {
                // crIndex === -1 && lfIndex === -1
                endCol = this.col + comment.length
                comment = ''
            }
        }
        this.line = this.line + lineCount
        this.col = endCol
        const token: Nako3Token = {
            type: 'COMMENT_BLOCK',
            startLine,
            startCol,
            endLine: this.line,
            endCol,
            resEndCol : endCol,
            lineCount,
            len,
            text: text.substring(0, len),
            value: text.substring(startTag.length, len - (index >= 0 ? endTag.length : 0)),
        }
        this.rawTokens.push(token)
        return len
    }

    parseString (text: string, opts: SubProcOptArgs): number {
        const startLine = this.line
        const startCol = this.col
        const startTag = opts[0]
        const endTag = opts[1]
        const type = opts[2]
        const index = text.indexOf(endTag, startTag.length)
        let len = index >= 0 ? index + endTag.length : text.length
        let str = text.substring(0, len)
        let lineCount = 0
        let endCol = null
        while (str !== '') {
            const crIndex = str.indexOf('\r');
            const lfIndex = str.indexOf('\n');
            if (crIndex !== -1 && lfIndex !== -1 && crIndex + 1 === lfIndex) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                str = str.substring(crIndex + 2);
            } else if (crIndex !== -1 && ((lfIndex !== -1 && crIndex < lfIndex) || lfIndex === -1)) {
                lineCount ++
                endCol = crIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                str = str.substring(crIndex + 1)
            } else if (lfIndex !== -1 && ((crIndex !== -1 && lfIndex <= crIndex) || crIndex === -1)) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                str = str.substring(lfIndex + 1)
            } else {
                // crIndex === -1 && lfIndex === -1
                endCol = this.col + str.length
                str = ''
            }
        }
        const resEndCol = endCol
        const resLen = len
        let josiStartCol:number = undefined
        const r = josiRE.exec(text.substring(len))
        let josi = ''
        if (r) {
            josiStartCol = endCol
            josi = r[0].replace(/^\s+/, '')
            len += r[0].length
            endCol += r[0].length
            if (text.charAt(len) === ',' || text.charAt(len) === '，' || text.charAt(len) === '、') {
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
        this.line = this.line + lineCount
        this.col = endCol
        const token: Nako3Token = {
            type: type,
            startLine,
            startCol,
            endLine: this.line,
            endCol,
            resEndCol,
            lineCount,
            len,
            josi,
            josiStartCol,
            text: text.substring(0, len),
            value: text.substring(startTag.length, resLen - (index >= 0 ? endTag.length : 0)),
        }
        this.rawTokens.push(token)
        return len
    }

    parseWord (text: string, opts: SubProcOptArgs): number {
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
                    if (line.charAt(0) === ',' || line.charAt(0) === '，' || line.charAt(0) === '、') {
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
            if (line.charAt(0) === '、') {
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
        if (josi === 'には' || josi === 'は~' || josi === 'は～') {
            this.col += resLen
            const token: Nako3Token = {
                type: 'WORD',
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
                josi: '',
                josiStartCol: undefined,
            }
            this.rawTokens.push(token)
            return this.parseFunctionDeclare(text.substring(resLen)) + resLen
        }
        this.col += len
        const token: Nako3Token = {
            type: 'WORD',
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
        }
        this.rawTokens.push(token)
        return len
    }

    parseFunctionDeclare (text: string): number {
        const startCol = this.col
        let token: Nako3Token
        const generateToken = (len: number) => {
            token = {
                type: 'FUNCTION_DECLARE',
                startLine: this.line,
                startCol,
                endLine: this.line,
                endCol: startCol + len,
                resEndCol: startCol + len,
                lineCount: 0,
                len,
                text: text.substring(0, len),
                value: text.substring(0, len),
            }
            this.col = startCol + len
            this.rawTokens.push(token)
            return len
        }
        const skipSpace = (line) => {
            const r = spaceRE.exec(line)
            if (r) {
                const tokenLen = r[0].length
                this.col += tokenLen
                line = line.substring(tokenLen)
            }
            return line
        }
        let len = 0
        const crIndex = text.indexOf('\r')
        const lfIndex = text.indexOf('\n')
        if (crIndex !== -1 && lfIndex !== -1 && crIndex + 1 === lfIndex) {
            len = crIndex
        } else if (crIndex !== -1 && ((lfIndex !== -1 && crIndex < lfIndex) || lfIndex === -1)) {
            len = crIndex
        } else if (lfIndex !== -1 && ((crIndex !== -1 && lfIndex <= crIndex) || crIndex === -1)) {
            len = lfIndex
        } else {
            // crIndex === -1 && lfIndex === -1
            len = text.length
        }
        let line = text.substring(0, len)
        let isMumei = false
        let tokenLen:number
        // 関数宣言であることのマーク(keyword)を取り出す
        if (/^(●|\*)/.test(line)) {
            tokenLen = 1
        } else if (/^(関数)/.test(line)) {
            tokenLen = 2
        } else if (/^(には|は~|は～)/.test(line)) {
            isMumei = true
            tokenLen = 2
        } else {
            return generateToken(len)
        }
        token = {
            type: 'FUNCTION_DECLARE',
            startLine: this.line,
            startCol: this.col,
            endLine: this.line,
            endCol: this.col + tokenLen,
            resEndCol: this.col + tokenLen,
            lineCount: 0,
            len: tokenLen,
            text: line.substring(0, tokenLen),
            value: line.substring(0, tokenLen),
        }
        this.rawTokens.push(token)
        this.col += tokenLen
        line = line.substring(tokenLen)

        line = skipSpace(line)

        // 関数の属性(公開非公開とか)の指定を読み取る(あれば)
        if (!isMumei && /^(\{|｛)/.test(line)) {
            const r = /^(\{|｛)([^\}｝]*)(\}|｝)/.exec(line)
            if (!r) {
                return generateToken(len)
            }
            tokenLen = r[0].length
            token = {
                type: 'FUNCTION_ATTTRIBUTE',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col + tokenLen,
                resEndCol: this.col + tokenLen,
                lineCount: 0,
                len: tokenLen,
                text: line.substring(0, tokenLen),
                value: line.substring(1, tokenLen - 2),
            }
            this.rawTokens.push(token)
            this.col += tokenLen
            line = line.substring(tokenLen)

            line = skipSpace(line)
        }

        // 引数の定義があれば読み取る
        if (/^(\(|（)/.test(line)) {
            const r = /^(\(|（)([^\)）]*)(\)|）)/.exec(line)
            if (!r) {
                return generateToken(len)
            }
            tokenLen = r[0].length
            token = {
                type: 'FUNCTION_ARGSTRING',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col + tokenLen,
                resEndCol: this.col + tokenLen,
                lineCount: 0,
                len: tokenLen,
                text: line.substring(0, tokenLen),
                value: line.substring(1, tokenLen - 2),
            }
            this.rawTokens.push(token)
            this.col += tokenLen
            line = line.substring(tokenLen)

            line = skipSpace(line)
        }

        let resText = line
        const r = /(\(|（)([^\)）]*)(\)|）)/.exec(line)
        if (!isMumei && r) {
            let name = line.substring(0, r.index)
            tokenLen = name.length
            token = {
                type: 'FUNCTION_NAME',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col + tokenLen,
                resEndCol: this.col + tokenLen,
                lineCount: 0,
                len:  tokenLen,
                text: name,
                value: name.trim(),
            }
            this.rawTokens.push(token)
            this.col += tokenLen
            this.addUserFunction(name)
            let arg = r[1]
            tokenLen = arg.length
            token = {
                type: 'FUNCTION_ARGSTRING',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col + tokenLen,
                resEndCol: this.col + tokenLen,
                lineCount: 0,
                len:  tokenLen,
                text: arg,
                value: arg.slice(1).slice(0, -1),
            }
            this.rawTokens.push(token)
            this.col += tokenLen
            line = line.substring(tokenLen)
            resText = line
            let toha = ''
            let comma = ''
            if (resText.endsWith('、') || resText.endsWith('，') || resText.endsWith(',')) {
                comma = resText.slice(-1)
                resText = resText.slice(0, -1)
            }
            if (resText.endsWith('とは') || resText.endsWith('は～') || resText.endsWith('は~')) {
                toha = resText.slice(-2)
                resText = resText.slice(0, -2)
                tokenLen = resText.length
            }
            if (resText.length > 0) {
                return generateToken(len)
            }
            if (toha.length > 0) {
                tokenLen = toha.length + comma.length
                token = {
                    type: 'とは',
                    startLine: this.line,
                    startCol: this.col,
                    endLine: this.line,
                    endCol: this.col + tokenLen,
                    resEndCol: this.col + toha.length,
                    lineCount: 0,
                    len: tokenLen,
                    text: toha,
                    value: 'とは',
                }
                this.rawTokens.push(token)
                this.col += tokenLen
            } else if (comma.length > 0) {
                tokenLen = comma.length
                token = {
                    type: ',',
                    startLine: this.line,
                    startCol: this.col,
                    endLine: this.line,
                    endCol: this.col + tokenLen,
                    resEndCol: this.col + comma.length,
                    lineCount: 0,
                    len: tokenLen,
                    text: comma,
                    value: ',',
                }
                this.rawTokens.push(token)
                this.col += tokenLen
            }
        } else {
            tokenLen = line.length
            let toha = ''
            let comma = ''
            if (resText.endsWith('、') || resText.endsWith('，') || resText.endsWith(',')) {
                comma = resText.slice(-1)
                resText = resText.slice(0, -1)
            }
            if (resText.endsWith('とは') || resText.endsWith('は～') || resText.endsWith('は~')) {
                toha = resText.slice(-2)
                resText = resText.slice(0, -2)
                tokenLen = resText.length
            }
            token = {
                type: 'FUNCTION_NAME',
                startLine: this.line,
                startCol: this.col,
                endLine: this.line,
                endCol: this.col + tokenLen,
                resEndCol: this.col + resText.length,
                lineCount: 0,
                len: tokenLen,
                text: line.substring(0, tokenLen),
                value: resText,
            }
            this.rawTokens.push(token)
            this.col += tokenLen
            this.addUserFunction(resText)
            if (toha.length > 0) {
                tokenLen = toha.length + comma.length
                token = {
                    type: 'とは',
                    startLine: this.line,
                    startCol: this.col,
                    endLine: this.line,
                    endCol: this.col + tokenLen,
                    resEndCol: this.col + toha.length,
                    lineCount: 0,
                    len: tokenLen,
                    text: toha,
                    value: 'とは',
                }
                this.rawTokens.push(token)
                this.col += tokenLen
            }
        }
        
        this.col = startCol + len
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
        const convertType = (type: string, token: Nako3Token) => {
            if (type === 'WORD') {
                const rtype = this.userFunction[token.value] || this.userFunction[this.trimOkurigana(token.value)]
                if (rtype) {
                    type = 'ユーザー関数'
                    token.type = type
                }
            }
            if (type === 'WORD') {
                const rtype = reservedWords.get(token.value) || reservedWords.get(this.trimOkurigana(token.value))
                if (rtype) {
                    type = rtype
                    token.type = type
                }
                if (token.value === 'そう') {
                    token.value = 'それ'
                }
            }
            if (type === 'WORD') {
                const rtype = commandlist[token.value] || commandlist[this.trimOkurigana(token.value)]
                if (rtype) {
                    type = rtype
                    token.type = type
                }
            }
            return type
        }
        this.tokens = []
        let token:Nako3Token
        for (const rawToken of this.rawTokens) {
            let requirePush = true
            token = Object.assign({}, rawToken)
            let type = rawToken.type
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
                    token.type = convertType(type, token)
                    this.tokens.push(token)
                    token = Object.assign({}, rawToken, {
                        startCol: rawToken.endCol - 1,
                        endCol: rawToken.endCol,
                        resEndCol: rawToken.endCol,
                        len: 1,
                        type: '回',
                        text: '回',
                        value: '回',
                    })
                    this.tokens.push(token)
                    requirePush = false
                }
            }
            type = convertType(type, token)
            if (typeof rawToken.josi === 'undefined') {
                token.josi = ''
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
                this.tokens.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'EQ',
                    len: 1,
                    text: '=',
                    value: '=',
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.endCol - 1,
                    resEndCol: rawToken.endCol,
                })
                this.tokens.push(token)
                requirePush = false
            }
            if (rawToken.josi === 'とは') {
                token = Object.assign({}, rawToken, {
                    type,
                    josi: '',
                    josiStartCol: null,
                    len: rawToken.josiStartCol,
                    text: rawToken.text.slice(0, - (rawToken.len - rawToken.josiStartCol)),
                    endCol: rawToken.josiStartCol,
                })
                this.tokens.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'とは',
                    len: rawToken.len - rawToken.josiStartCol,
                    josi: '',
                    josiStartCol: null,
                    text: rawToken.text.substring(rawToken.len - rawToken.josiStartCol),
                    value: 'とは',
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.endCol,
                })
                this.tokens.push(token)
                requirePush = false
            }
            if (tararebaMap[rawToken.josi]) {
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
                this.tokens.push(token)
                token = Object.assign({}, rawToken, {
                    type: 'ならば',
                    len: rawToken.len - rawToken.josiStartCol,
                    text: rawJosi,
                    value: josi,
                    josi: '',
                    josiStartCol: null,
                    startCol: rawToken.josiStartCol,
                    resEndCol: rawToken.josiStartCol + rawJosi.length,
                })
                this.tokens.push(token)
                requirePush = false
            }
            if (requirePush) { 
                token.type = type
                this.tokens.push(token)
            }
        }
    }

    addUserFunction (name: string):void {
        const nameTrimed = name.trim()
        const nameNormalized = this.trimOkurigana(nameTrimed)
        this.userFunction[nameTrimed] = true
        if (nameTrimed !== nameNormalized) {
            this.userFunction[nameNormalized] = true
        }
    }
}
class Nako3DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, canceltoken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        // analyze the document and return semantic tokens
        //console.log('semantec syntax highlight: enter')
        const tokensBuilder = new vscode.SemanticTokensBuilder(legend)
        let text = document.getText()
        const tokenizer = new Nako3Tokenizer(document.fileName)
        tokenizer.tokenize(text)
        tokenizer.fixTokens()
        let tokens = tokenizer.tokens
        for (const token of tokens) {
            //if (token.type !== 'EOL') {
            //    //console.log(`${token.type} range(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
            //    //console.log(`${token.type}:${token.value} + ${token.josi}`)
            //    console.log(`${token.type} range(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol}) :${token.value} + ${token.josi}`)
            //}

            const highlightClass = hilightMapping[token.type]
            if (highlightClass) {
                let tokenType:string
                let tokenModifier:string[]
                if (typeof highlightClass === 'string') {
                    tokenType = highlightClass
                    tokenModifier = []
                } else {
                    tokenType = highlightClass[0]
                    if (typeof highlightClass[1] === 'string') {
                        tokenModifier = [highlightClass[1]]
                    } else {
                        tokenModifier = highlightClass[1]
                    }
                }
                // console.log(`${tokenType} range(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
                let endCol = token.endCol
                let len = token.len
                if (token.type === 'WORD' || tokenType === 'string' || tokenType === 'number' || tokenType === 'function' || tokenType === 'variable') {
                    endCol = token.resEndCol
                }
                if (false) {
                    // console.log(`${tokenType}[${tokenModifier}] range(${token.startLine}:${token.startCol}-${token.endLine}:${endCol})`)
                    //console.log(`push before:${tokenType} ${tokenModifier.join(',')}`)
                    const startPosition = new vscode.Position(token.startLine, token.startCol)
                    //console.log('push 1')
                    const endPosition = new vscode.Position(token.endLine, endCol)
                    //console.log('push 2')
                    const targetRange = new vscode.Range(startPosition, endPosition)
                    //console.log('push 3')
                    tokensBuilder.push(targetRange, tokenType, tokenModifier)
                    //console.log(`push after:${tokenType} ${tokenModifier.join(',')}`)
                } else {
                    // console.log(`${tokenType}[${tokenModifier}] range(${token.startLine}:${token.startCol}-${len})`)
                    const tokenTypeIndex = tokenTypes.indexOf(tokenType)
                    let ng = false
                    if (tokenTypeIndex === -1) {
                        console.log(`type:${tokenType} no include lengend`)
                        ng = true
                    }
                    let tokenModifierBits = 0
                    for (const modifier of tokenModifier) {
                        const tokenModifierIndex = tokenModifiers.indexOf(modifier)
                        if (tokenTypeIndex === -1) {
                            console.log(`modifier:${modifier} no include lengend`)
                            ng = true
                            continue
                        }
                        tokenModifierBits |= 1 << tokenModifierIndex
                    }
                    if (!ng) {
                        let col = token.startCol
                        for (let i = token.startLine;i <= token.endLine;i++) {
                            if (i === token.endLine) {
                                len = endCol - col
                            } else {
                                len = tokenizer.lengthLines[i] - col
                            }
                            tokensBuilder.push(i, col, len, tokenTypeIndex, tokenModifierBits)
                            col = COL_START
                        }
                    }
                }
            }
        }
        // console.log('semantec syntax highlight: leave')
        return tokensBuilder.build();
    }
}

export function activate(context) {
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(NAKO3_MODE, new Nako3DocumentSemanticTokensProvider(), legend));
}

export function deactivate() {
    return undefined;
}
