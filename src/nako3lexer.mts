import reservedWords from './nako3/nako_reserved_words.mjs'
// 助詞の一覧
import { josiRE, removeJosiMap, tararebaMap } from './nako3/nako_josi_list.mjs'
import { Token, Indent, TokenDefFunc, TokenCallFunc, TokenRefVar, TokenType, Nako3TokenTypePlugin } from './nako3token.mjs'
import { lexRules, lexRulesRE, ProcMap, SubProcOptArgs, reservedGroup} from './nako3lexer_rule.mjs'
import { trimOkurigana, filenameToModName, convert } from './nako3util.mjs'
import { ModuleLink  } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { Nako3Command, CommandInfo } from './nako3command.mjs'
import { logger } from './logger.mjs'
import type { RuntimeEnv,  DeclareThings, ModuleOption, DeclareThing, DeclareFunction, FunctionArg, DeclareVariable } from './nako3types.mjs'

interface ImportInfo {
    value: string
    tokenIndex: number
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export const COL_START = 0
export const LINE_START = 0

interface UserFunctionInfo {
    name: string
    nameNormalized: string
    fileName: string|null
    tokenIndex: number
    isPrivate: boolean
}

export class Nako3Tokenizer {
    filename: string
    modName: string
    // textから生成したtoken列。全てのトークンを含む。書き換えなし。
    rawTokens: Token[]
    // rawTokensから書き換えのあるトークン列。ただしコメントは除く。
    tokens: Token[]
    commentTokens: Token[]
    errorInfos: ErrorInfoManager
    lengthLines: number[]
    procMap: ProcMap
    line: number
    col: number
    commands: Nako3Command|null
    runtimeEnv: RuntimeEnv
    runtimeEnvDefault: RuntimeEnv
    useShebang: boolean
    pluginNames: string[]
    imports: ImportInfo[]
    declareThings: DeclareThings
    link: ModuleLink
    moduleOption: ModuleOption
    moduleSearchPath: string[]

    constructor (filename: string, moduleOption: ModuleOption, link: ModuleLink) {
        this.filename = filename
        this.modName = filenameToModName(filename, link)
        this.rawTokens = []
        this.tokens = []
        this.commentTokens = []
        this.errorInfos = new ErrorInfoManager()
        this.declareThings = new Map()
        this.lengthLines = []
        this.line = 0
        this.col = 0
        this.commands = null
        this.pluginNames = []
        this.moduleSearchPath = []
        this.runtimeEnv = ''
        this.runtimeEnvDefault = 'wnako'
        this.useShebang = true
        this.imports = []
        this.link = link
        this.moduleOption = moduleOption
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
     * 渡されたtextをトークンに分解して自身の保存する。
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
            let token: Token = {
                type: '?',
                group: '?',
                file: this.filename,
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
                    if (rule.name === 'space' && r !== null) {
                        const len = r[0].length
                        this.col += len
                        text = text.substring(len)
                        break
                    }
                    if (rule.proc) {
                        const proc = this.procMap[rule.proc]
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
                        if (rule.value) {
                            token.value = rule.value
                        } else {
                            token.value = text.substring(0, token.len)
                        }
                        text = text.substring(token.len)
                        if (rule.withUnit) {
                            const r = lexRulesRE.unit.exec(text)
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
                this.errorInfos.addFromToken('ERROR', 'invalidChar', { code: text.substring(0,1).codePointAt(0)!}, token)
                this.col = token.endCol
                this.rawTokens.push(token)
                len = 1
                text = text.substring(len)
            }

            if (token.type === 'eol' && token.value === '\n') {
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
        const token: Token = {
            type: 'COMMENT_LINE',
            group: 'コメント',
            file: this.filename,
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
        const startTag = opts[0]!
        const endTag = opts[1]!
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
        const token: Token = {
            type: 'COMMENT_BLOCK',
            group: 'コメント',
            file: this.filename,
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
        const startTag = opts[0]!
        const endTag = opts[1]!
        const type = opts[2]!
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
                    const token: Token = {
                        type: type,
                        group :'文字列',
                        file: this.filename,
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
                        let token: Token
                        // "{" mark
                        token = {
                            type: 'STRING_INJECT_START',
                            group: '記号',
                            file: this.filename,
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
                            file: this.filename,
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
        this.col = endCol
        const token: Token = {
            type: hasInject ? type: 'string',
            group: '文字列',
            file: this.filename,
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
                if (lexRulesRE.andOr.test(line)) {
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
            const k = lexRulesRE.kanakanji.exec(line)
            if (k) {
                resLen += k[0].length
                line = line.substring(k[0].length)
                continue
            }
            const h = lexRulesRE.hira.test(line)
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
        let res = convert(text.substring(0, resLen))
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
        const ii = lexRulesRE.ijoIka.exec(res)
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
        const token: Token = {
            type: 'word',
            group: '単語',
            file: this.filename,
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

    fixTokens ():void {
        this.tokens = []
        this.commentTokens = []
        this.moduleOption.isIndentSemantic = false
        this.moduleOption.isPrivateDefault = false
        this.moduleOption.isExportDefault = false
        this.runtimeEnv = ''
        this.imports = []
        this.declareThings.clear()
        let token:Token
        let rawToken:Token|null = null
        let reenterToken:Token[] = []
        const functionIndex:number[] = []
        const preprocessIndex: number[] = []
        let topOfLine = true
        let isLine0Col0 = true
        let delayedToken: Token|null = null
        const pushToken = (token: Token) => {
            let type = token.type
            if ((type === 'def_func' || type === '*') && token.startCol === 0 && token.josi === '') {
                functionIndex.push(this.tokens.length)
                if (type === '*') {
                    logger.info(`tokenize: function start with token-type '*'. not 'def_fund'`)
                }
            } else if (type === 'には') {
                functionIndex.push(this.tokens.length)
            }
            if (type === 'COMMENT_LINE' || type === 'COMMENT_BLOCK' || type === '_eol') {
                if (isLine0Col0 && type === 'COMMENT_LINE') {
                    if (this.useShebang && token.text.startsWith('#!')) {
                        if (token.text.includes('snako')) {
                            this.runtimeEnv = 'snako'
                        } else if (token.text.includes('cnako')) {
                            this.runtimeEnv = 'cnako'
                        }
                    }
                }
                this.commentTokens.push(token)
            } else {
                if (type === 'eol') {
                    topOfLine = true
                } else {
                    if (topOfLine && type === 'not') {
                        preprocessIndex.push(this.tokens.length)
                    }
                    topOfLine = false
                }
                this.tokens.push(token)
            }
        }
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
            if (type === 'word' && rawToken.josi === '' && rawToken.value.length >= 2) {
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
                    type: 'eq',
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
                token.type = type
                if (delayedToken === null) {
                    delayedToken = token
                } else {
                    if (delayedToken.type === 'word' && delayedToken.value === '_' && delayedToken.josi === '' && token.type === 'eol') {
                        token.startLine = delayedToken.startLine
                        token.startCol = delayedToken.startCol
                        token.len = token.endCol - delayedToken.startCol
                        token.text = '_\n'
                        token.value = '_\n'
                        token.type = '_eol'
                        delayedToken = null
                    } else if (delayedToken.type === 'エラー' && token.type === 'ならば' && delayedToken.josi === '' && delayedToken.endCol === token.startCol) {
                        token.startLine = delayedToken.startLine
                        token.startCol = delayedToken.startCol
                        token.len = token.endCol - delayedToken.startCol
                        token.text = 'エラーならば'
                        token.value = 'エラーならば'
                        token.type = 'エラーならば'
                        delayedToken = null
                    }
                    if (delayedToken) {
                        pushToken(delayedToken)
                    }
                    delayedToken = token
                }
                isLine0Col0 = false
            }
        }
        if (delayedToken) {
            pushToken(delayedToken)
        }

        const lastToken = this.tokens[this.tokens.length - 1]
        this.tokens.push({
            type: 'eol',
            group: '区切',
            len: 0,
            lineCount: 0,
            startLine: lastToken.endLine,
            startCol: lastToken.endCol,
            endLine: lastToken.endLine,
            endCol: lastToken.endCol,
            resEndCol: lastToken.endCol,
            text: '---',
            value: ';',
            unit: '',
            josi: '',
            indent: { len: 0, level: 0, text: '' },
            file: lastToken.file
        })
        this.tokens.push({
            type: 'eof',
            group: '区切',
            len: 0,
            lineCount: 0,
            startLine: lastToken.endLine,
            startCol: lastToken.endCol,
            endLine: lastToken.endLine,
            endCol: lastToken.endCol,
            resEndCol: lastToken.endCol,
            text: '',
            value: '',
            unit: '',
            josi: '',
            indent: { len: 0, level: 0, text: '' },
            file: lastToken.file
        })
        this.preprocess(preprocessIndex)
        this.enumlateFunction(functionIndex)
    }

    preprocess (preprocessIndex: number[]):void {
        let token: Token
        const tokens = this.tokens
        const tokenCount = tokens.length
        for (const index of preprocessIndex) {
            let hit = false
            let causeError = false
            let i = index
            let targetToken: Token|null = null
            let targetType: TokenType = '?'
            token = tokens[i]
            if (!(token.type === 'not' && (token.value === '!' || token.value === '！'))) {
                logger.log(`internal error: invalid token, expected 'NOT' token`)                
            }
            i++
            token = tokens[i]
            if (token.type === 'word' && trimOkurigana(token.value) === '厳チェック') {
                this.moduleOption.isStrict = true
                targetToken = token
                targetType = '厳チェック'
                logger.info('strict on')
                hit = true
            } else if (token.type === 'word' && token.value === '非同期モード') {
                this.moduleOption.isAsync = true
                targetToken = token
                targetType = '非同期モード'
                logger.info('async mode on')
                logger.log('『非同期モード』構文は廃止されました(https://nadesi.com/v3/doc/go.php?1028)。', token)
                this.errorInfos.addFromToken('WARN', 'deprecatedAsync', {}, tokens[index], token)
                hit = true
            } else if (token.type === 'word' && token.value === 'DNCLモード') {
                this.moduleOption.isDNCL = true
                targetToken = token
                targetType = 'DNCLモード'
                this.errorInfos.addFromToken('WARN', 'noSupportDNCL', {}, tokens[index], token)
                logger.info('DNCL1 mode on')
                hit = true
            } else if (token.type === 'word' && ['DNCL2モード','DNCL2'].includes(token.value)) {
                this.moduleOption.isDNCL2 = true
                targetToken = token
                targetType = 'DNCL2モード'
                this.errorInfos.addFromToken('WARN', 'noSupportDNCL', {}, tokens[index], token)
                logger.info('DNCL2 mode on')
                hit = true
            } else if (token.type === 'word' && token.value === 'インデント構文') {
                this.moduleOption.isIndentSemantic = true
                targetToken = token
                targetType = 'インデント構文'
                logger.info('indent semantic on')
                hit = true
            } else if (token.type === 'word' && token.value === 'モジュール公開既定値') {
                targetToken = token
                targetType = 'モジュール公開既定値'
                i++
                token = tokens[i]
                if (token.type === 'eq') {
                    i++
                    token = tokens[i]
                    if (token.type === 'string') {
                        this.moduleOption.isPrivateDefault = token.value === '非公開'
                        this.moduleOption.isExportDefault = token.value === '公開'
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
                hit = true
            } else if (i+1 < tokenCount && token.type === 'string' && token.josi === 'を' && tokens[i+1].type === 'word' && trimOkurigana(tokens[i+1].value) === '取込') {
                targetToken = token
                targetType = '取込'
                logger.info('import file')
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
                hit = true
            }
            if (hit) {
                tokens[index].type = '!'
                if (targetToken) {
                    targetToken.type = targetType
                }
                if (!causeError) {
                    i++
                    token = tokens[i]
                    if (!(token.type === 'eol')) {
                        this.errorInfos.addFromToken('ERROR', `invalidTokenInPreprocessExpected`, { expected:'EOL', type: token.type, value: token.value }, token)
                    }
                }
            }
        }
    }

    enumlateFunction (functionIndex: number[]):void {
        let args = new Map<string, FunctionArg>()
        let argOrder: string[] = []
        const parseArguments = (i:number):number => {
            // jに先頭位置、iに最短の')'またはEOLの位置を求める。
            let token: Token
            let j = i
            for (;i < this.tokens.length && this.tokens[i].type !== ')' && this.tokens[i].type !== 'eol';i++) {
                //
            }
            if (j < i && this.tokens[i].type === ')') {
                token = this.tokens[j]
                if (token.type === '(') {
                    token.type = 'FUNCTION_ARG_PARENTIS_START'
                    j++
                }
                while (j <= i) {
                    let attr: string[] = []
                    let varname: string = ''
                    let josi: string[] = []
                    token = this.tokens[j]
                    let k = j
                    if (token.type === '{') {
                        token.type = 'FUNCTION_ARG_ATTR_START'
                        j++
                        token = this.tokens[j]
                        if (token.type === 'word') {
                            token.type = 'FUNCTION_ARG_ATTRIBUTE'
                            attr.push(token.value)
                            j++
                            token = this.tokens[j]
                        }
                        if (token.type === '}') {
                            token.type = 'FUNCTION_ARG_ATTR_END'
                            j++
                            token = this.tokens[j]
                        }
                    }
                    if (token.type === 'word') {
                        token.type = 'FUNCTION_ARG_PARAMETER'
                        varname = token.value
                        if (args.has(varname)) {
                            const arg = args.get(varname)
                            josi = arg!.josi
                            arg!.attr.push(...attr)
                            attr = arg!.attr
                        } else {
                            const arg = {
                                varname, attr, josi
                            }
                            args.set(varname, arg)
                            argOrder.push(varname)
                        }
                        if (token.josi !== '') {
                            josi.push(token.josi)
                        }
                        j++
                        token = this.tokens[j]
                    }
                    if (token.type === ',' || token.type === '|') {
                        token.type = 'FUNCTION_ARG_SEPARATOR'
                        j++
                        token = this.tokens[j]
                    }
                    if (token.type === ')') {
                        token.type = 'FUNCTION_ARG_PARENTIS_END'
                        j++
                        token = this.tokens[j]
                    }
                    if (j === k) {
                        this.errorInfos.addFromToken('ERROR', 'unknownTokenInFuncParam', {type: token.type}, token)
                        break
                    }
                }
                if (j !== i + 1) {
                    token = this.tokens[j]
                    this.errorInfos.addFromToken('ERROR', 'unknownTokenInFuncParam', {type: token.type}, token)
                }
                i++
            } else {
                this.errorInfos.addFromToken('ERROR', 'noFunctionParamParentisR', {token:this.tokens[j].type}, this.tokens[j])
            }
            return i
        }
        let token: Token
        for (const index of functionIndex) {
            let i = index
            let isMumei = false
            let isPrivate = this.moduleOption.isPrivateDefault
            let isExport = this.moduleOption.isExportDefault
            args = new Map<string, FunctionArg>()
            argOrder = []
            token = this.tokens[i]
            if (token.type === '*') {
                token.type = 'def_func'
            }
            if (token.type === 'には') {
                isMumei = true
                token.type = 'def_func'
            }
            i++
            token = this.tokens[i]
            if (!isMumei && token.type === '{') {
                let j = i
                for (;i < this.tokens.length && this.tokens[i].type !== '}' && this.tokens[i].type !== 'eol';i++) {
                    //
                }
                if (this.tokens[i].type === '}') {
                    this.tokens[j].type = 'FUNCTION_ATTR_PARENTIS_START'
                    j++
                    this.tokens[i].type = 'FUNCTION_ATTR_PARENTIS_END'
                    for (;j < i;j++) {
                        token = this.tokens[j]
                        token.type = 'FUNCTION_ATTRIBUTE'
                        if (token.value === '非公開') {
                            isPrivate = true
                            isExport = false
                        } else if (token.value === '公開') {
                            isExport = true
                            isPrivate = false
                        }
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
            let funcName: string = ''
            let funcNameIndex: number = -1
            if (!isMumei && token.type === 'word') {
                token.type = 'FUNCTION_NAME'
                funcName = token.value
                funcNameIndex = index
                if (token.josi === 'とは') {
                    hasToha = true
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasToha && (token.type === 'とは' || (token.type === 'word' && token.value === 'とは'))) {
                if (token.type === 'word' && token.value === 'とは') {
                    console.warn(`とは type was WORD`)
                }
                i++
            }
            token = this.tokens[i]
            if (!isMumei && !hasParameter && token.type === '(') {
                i = parseArguments(i)
                hasParameter = true
            }
            const orderedArgs: FunctionArg[] = []
            for (const orderKey of argOrder) {
                const arg = args.get(orderKey)!
                orderedArgs.push(arg)
            }
            this.addUserFunction(funcName, orderedArgs, isExport, isPrivate, isMumei, funcNameIndex, index)
        }
    }

    addUserFunction (name: string, args: FunctionArg[], isExport: boolean, isPrivate: boolean, isMumei: boolean, index: number, defTokenIndex: number):void {
        const nameTrimed = name.trim()
        const nameNormalized = trimOkurigana(nameTrimed)
        const declFunction: DeclareFunction = {
            name: nameTrimed,
            nameNormalized: nameNormalized,
            modName: this.modName,
            type: 'func',
            isMumei,
            args: args,
            isPure: true,
            isAsync: false,
            isVariableJosi: false,
            isExport,
            isPrivate
        }
        if (nameTrimed.length > 0) {
            this.declareThings.set(nameNormalized, declFunction)
        }
        (this.tokens[defTokenIndex] as TokenDefFunc).meta = declFunction
    }

    applyFunction() {
        for (const token of this.tokens) {
            const v = token.value
            const tv = trimOkurigana(v)
            let type = token.type
            let nextTokenToFuncPointer = false
            if (type === 'word') {
                const thing = this.declareThings.get(tv)
                if (thing) {
                    switch (thing.type) {
                    case 'func':
                        (token as TokenCallFunc).meta = thing as DeclareFunction
                        if (nextTokenToFuncPointer) {
                            (token as TokenCallFunc).isFuncPointer = true
                        }
                        type = 'user_func'
                        break
                    case 'var':
                        type = 'user_var'
                        break
                    case 'const':
                        type = 'user_const'
                        break
                    default:
                        type = '?'
                        break
                    }
                    token.type = type
                }
            }
            if (type === 'word') {
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
            if (type === 'word' && this.commands) {
                const commandInfo = this.getCommandInfo(v)
                if (commandInfo) {
                    if (commandInfo.type === 'func') {
                        (token as TokenCallFunc).meta = commandInfo as DeclareFunction
                        if (nextTokenToFuncPointer) {
                            (token as TokenCallFunc).isFuncPointer = true
                        }
                        type = 'sys_func'
                    } else if (commandInfo.type === 'var') {
                        (token as TokenRefVar).meta = commandInfo as DeclareVariable
                        type = 'sys_var'
                    } else {
                        (token as TokenRefVar).meta = commandInfo as DeclareVariable
                        type = 'sys_const'
                    }
                    token.type = type
                }
            }
            nextTokenToFuncPointer = false
            if (type === 'func_ptr' && token.value === '{関数}') {
                nextTokenToFuncPointer = true
            }
        }
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
}
