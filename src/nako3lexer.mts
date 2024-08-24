import reservedWords from './nako3/nako_reserved_words.mjs'
// 助詞の一覧
import { josiRE, removeJosiMap, tararebaMap } from './nako3/nako_josi_list.mjs'
import commandjson from './nako3/command.json'
import { AnyNsRecord } from 'dns'

interface Indent {
    text: string
    level: number
    len: number
}
export interface Nako3Token {
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
    unit: ''|string
    unitStartCol?: number
    josi: ''|string
    josiStartCol?: number
}

type ProcMapKey = 'cbCommentBlock'|'cbCommentLine'|'cbString'|'cbStringEx'|'cbWord'
type SubProcOptArgs = string[]
type SubProc = (text:string, opts:SubProcOptArgs) => number
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

const spaceRE = /^( |　|\t|・|⎿|└|｜)+/

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
    { name: 'NUMBER', pattern: /^[０-９]+([_＿][０-９]+)*[.．]([０-９]+([_＿][０-９]+)*)?([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^[.．][０-９]+([_＿][０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'NUMBER', pattern: /^[０-９]+(_[０-９]+)*([eEｅＥ][+|-|＋|－]?[０-９]+([_＿][０-９]+)*)?/, withJosi: true, withUnit: true},
    { name: 'COMMENT_LINE', pattern: /^(#|＃|\/\/|／／)/, proc: 'cbCommentLine' },
    { name: 'COMMENT_BLOCK', pattern: '/*', proc: 'cbCommentBlock', procArgs: ['/*', '*/']  },
    { name: 'COMMENT_BLOCK', pattern: '／＊', proc: 'cbCommentBlock', procArgs: ['／＊', '＊／'] },
    { name: 'def_func', pattern: '●', isFirstCol: true },
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

type CmdSectionEntry = [string, string, string, string, string]
type CmdPluginEntry = { [sectionName:string] : CmdSectionEntry[] }
type CmdJsonEntry = { [pluginName:string]: CmdPluginEntry }
let commandlist:{ [name:string]: string } = {}
for (const pluginname of Object.keys(commandjson)) {
    const plugin = (commandjson as unknown as CmdJsonEntry)[pluginname] as CmdPluginEntry
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
export const COL_START = 0
export const LINE_START = 0
type ProcMap = { [K in ProcMapKey]: SubProc }
interface UserFunctionInfo                          {
    name: string
    tokenIndex: number
}
export class Nako3Tokenizer {
    filename: string
    rawTokens: Nako3Token[]
    tokens: Nako3Token[]
    userFunction: {[key:string]: UserFunctionInfo }
    userVariable: {[key:string]: UserFunctionInfo }
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
            cbString: this.parseString,
            cbStringEx: this.parseString,
            cbWord: this.parseWord,
        }
    }

    tokenize (text: string):void {
        this.rawTokens = []
        this.line = LINE_START
        this.col = COL_START
        let indent: Indent
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
                        const len = proc.apply(this, [text, args])
                        text = text.substring(len)
                    } else {
                        token.type = rule.name
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
                console.log(`character:${text.substring(0,1).codePointAt(0)}`)
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
            unit: '',
            josi: '',
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
        let endCol = this.col
        while (comment !== '') {
            const crIndex = comment.indexOf('\r')
            const lfIndex = comment.indexOf('\n')
            if (crIndex !== -1 && lfIndex !== -1 && crIndex + 1 === lfIndex) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                comment = comment.substring(crIndex + 2)
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
            unit: '',
            josi: '',
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
        let endCol = this.col
        while (str !== '') {
            const crIndex = str.indexOf('\r')
            const lfIndex = str.indexOf('\n')
            if (crIndex !== -1 && lfIndex !== -1 && crIndex + 1 === lfIndex) {
                lineCount ++
                endCol = lfIndex
                this.lengthLines.push(this.col + endCol)
                this.col = COL_START
                str = str.substring(crIndex + 2)
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
        let josiStartCol:number|undefined
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
            unit: '',
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
/*
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
                unit: '',
                josi: '',
                text: text.substring(0, len),
                value: text.substring(0, len),
            }
            this.col = startCol + len
            this.rawTokens.push(token)
            return len
        }
        const skipSpace = (line: string): string => {
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
            unit: '',
            josi: '',
            text: line.substring(0, tokenLen),
            value: line.substring(0, tokenLen),
        }
        this.rawTokens.push(token)
        this.col += tokenLen
        line = line.substring(tokenLen)

        line = skipSpace(line)

        // 関数の属性(公開非公開とか)の指定を読み取る(あれば)
        if (!isMumei && /^(\{|｛)/.test(line)) {
            const r = /^(\{|｛)([^}｝]*)(\}|｝)/.exec(line)
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
            const r = /^(\(|（)([^)）]*)(\)|）)/.exec(line)
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
        const r = /(\(|（)([^)）]*)(\)|）)/.exec(line)
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
*/
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

    applyFunction() {
        for (const token of this.tokens) {
            let type = token.type
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
        }
    }

    fixTokens ():void {
        this.tokens = []
        let token:Nako3Token
        let rawToken:Nako3Token|null = null
        let reenterToken:Nako3Token[] = []
        const functionIndex:number[] = []
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
                } else if (type === 'には') {
                    functionIndex.push(this.tokens.length)
                }
                token.type = type
                this.tokens.push(token)
            }
        }
        this.enumlateFunction(functionIndex)
    }

    enumlateFunction (functionIndex: number[]):void {
        const parseArguments = (i:number):number => {
            let j = i
            for (;i < this.tokens.length && this.tokens[i].type !== ')' && this.tokens[i].type !== 'EOF';i++) {
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
                        console.error(`unknown token in function parameters:${token.type}`)
                    }
                }
                i++
            }
            return i
        }
        let token: Nako3Token
        for (const index of functionIndex) {
            let i = index
            let isMumei = false
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
                for (;i < this.tokens.length && this.tokens[i].type !== '}' && this.tokens[i].type !== 'EOF';i++) {
                    //
                }
                if (this.tokens[i].type === '}') {
                    for (;j <= i;j++) {
                        token = this.tokens[j]
                        token.type = 'FUNCTION_ATTRIBUTE'
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
                this.addUserFunction(token.value, index)
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

    addUserFunction (name: string, index: number):void {
        const nameTrimed = name.trim()
        const nameNormalized = this.trimOkurigana(nameTrimed)
        this.userFunction[nameTrimed] =  {
            name: nameTrimed,
            tokenIndex: index
        }
        if (nameTrimed !== nameNormalized) {
            this.userFunction[nameNormalized] = {
                name: nameTrimed,
                tokenIndex: index
            }
        }
    }
}
