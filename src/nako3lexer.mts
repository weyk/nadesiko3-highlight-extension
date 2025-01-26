import { ModuleLink, ModuleEnv  } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { lexRules, lexRulesRE, ProcMap, SubProcOptArgs } from './nako3lexer_rule.mjs'
import { josiRE, removeJosiMap } from './nako3/nako_josi_list.mjs'
import { filenameToModName, convert } from './nako3util.mjs'
import type { Token, Indent } from './nako3token.mjs'

export interface TokenizeResult {
    tokens: Token[]
    lengthLines: number[]
}

export const COL_START = 0
export const LINE_START = 0

export class Nako3Tokenizer {
    // textから生成したtoken列。全てのトークンを含む。書き換えなし。
    private rawTokens: Token[]
    private lengthLines: number[]
    private procMap: ProcMap
    private line: number
    private col: number
    private moduleEnv: ModuleEnv
    public errorInfos: ErrorInfoManager

    constructor (moduleEnv: ModuleEnv) {
        this.moduleEnv = moduleEnv
        this.rawTokens = []
        this.errorInfos = new ErrorInfoManager()
        this.lengthLines = []
        this.line = 0
        this.col = 0
        this.procMap = {
            cbCommentBlock: this.parseBlockComment,
            cbCommentLine: this.parseLineComment,
            cbString: this.parseString,
            cbStringEx: this.parseString,
            cbWord: this.parseWord,
            cbWordEx: this.parseWordEx
        }
    }

    reset ():void {
        this.errorInfos.clear()
        this.rawTokens.length = 0
        this.lengthLines.length = 0
        this.line = 0
        this.col = 0
    }

    /** 
     * 保持しているトークンや解析毛結果を削除し生トークンを生成する
     * @param text トークン化する
     */
    tokenize (text: string): TokenizeResult {
        this.rawTokens = []
        this.lengthLines = []
        this.errorInfos.clear()
        this.line = LINE_START
        this.col = COL_START
        this.tokenizeProc(text)
        const lengthLines = this.lengthLines
        const tokens = this.rawTokens
        this.rawTokens = []
        this.lengthLines = []
        return {
            tokens,
            lengthLines
        }
    }

    setProblemsLimit (limit: number):void {
        this.errorInfos.setProblemsLimit(limit)
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
                fixType: '?',
                funcType: '?',
                parseType: '?',
                group: '?',
                uri: this.moduleEnv.uri,
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
                        if (rule.withCssUnit) {
                            // CSSの単位なら自動的に文字列として認識させる #1811
                            const cssUnit = lexRulesRE.cssUnitRE.exec(text)
                            if (cssUnit !== null) {
                                const cssUnitLen = cssUnit[0].length
                                token.type = 'string'
                                token.group = '文字列'
                                token.len += cssUnitLen
                                token.resEndCol += cssUnitLen
                                token.value += text.substring(0, cssUnitLen)
                                text = text.substring(cssUnitLen)
                            }
                        }
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
        return
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
            fixType: 'COMMENT_LINE',
            funcType: 'COMMENT_LINE',
            parseType: 'COMMENT_LINE',
            group: 'コメント',
            uri: this.moduleEnv.uri,
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
            fixType: 'COMMENT_BLOCK',
            funcType: 'COMMENT_BLOCK',
            parseType: 'COMMENT_BLOCK',
            group: 'コメント',
            uri: this.moduleEnv.uri,
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
            indent
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
                        fixType: type,
                        funcType: type,
                        parseType: type,
                        group :'文字列',
                        uri: this.moduleEnv.uri,
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
                        indent
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
                            fixType: 'STRING_INJECT_START',
                            funcType: 'STRING_INJECT_START',
                            parseType: 'STRING_INJECT_START',
                            group: '記号',
                            uri: this.moduleEnv.uri,
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
                            indent
                        }
                        this.rawTokens.push(token)
                        this.col++
                        const strex = str.substring(1, parenIndexEnd)
                        this.tokenizeProc(strex)
                        // "}" mark
                        token = {
                            type: 'STRING_INJECT_END',
                            fixType: 'STRING_INJECT_END',
                            funcType: 'STRING_INJECT_END',
                            parseType: 'STRING_INJECT_END',
                            group: '記号',
                            uri: this.moduleEnv.uri,
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
                            indent
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
            fixType: hasInject ? type: 'string',
            funcType: hasInject ? type: 'string',
            parseType: hasInject ? type: 'string',
            group: '文字列',
            uri: this.moduleEnv.uri,
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
            indent
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
            fixType: 'word',
            funcType: 'word',
            parseType: 'word',
            group: '単語',
            uri: this.moduleEnv.uri,
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
            indent
        }
        this.rawTokens.push(token)
        return len
    }


    /**
     * 単語のトークンを切り出す。tokenizeProcの下請け。
     * @param text 単語のトークンを切り出すテキスト。先頭位置が単語の先頭
     * @param indent 単語のある行の持つインデントの情報
     * @param opts 開始タグ、終了タグ、種類の配列。
     * @returns トークンの切り出しによって処理済みとなった文字数
     */
    private parseWordEx (text: string, indent: Indent, opts: SubProcOptArgs): number {
        const startLine = this.line
        const startCol = this.col
        const startTag = opts[0]!
        const endTag = opts[1]!
        const type = opts[2]!
        const index = text.indexOf(endTag, startTag.length)
        let len = index >= 0 ? index + endTag.length : startTag.length
        let str = text.substring(0, len)
        let lineCount = this.skipWithoutCrlf (str)
        let endCol = this.col
        let josiStartCol:number|undefined
        let josi = ''
        const resEndCol = endCol
        const resLen = len
        const r = josiRE.exec(text.substring(len))
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
        let res = convert(text.substring(startTag.length, resLen - endTag.length))
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
        if (lineCount > 0) {
            throw new Error('変数名に改行を含めることはできません。')
        }
        this.col = endCol
        const token: Token = {
            type: type,
            fixType: type,
            funcType: type,
            parseType: type,
            group: '単語',
            uri: this.moduleEnv.uri,
            startLine,
            startCol,
            endLine: this.line,
            endCol,
            resEndCol,
            lineCount,
            len,
            text: text.substring(0, len),
            value: res,
            unit: '',
            josi,
            josiStartCol,
            indent
        }
        this.rawTokens.push(token)
        return len
    }
}
