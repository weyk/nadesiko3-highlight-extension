import { lexRulesRE } from './nako3/nako3lexer_rule.mjs'
import { ModuleLink } from './nako3module.mjs'
import type { FunctionArg, ScopeIdRange, NakoRuntime } from './nako3/nako3types.mjs'
import type { Token} from './nako3/nako3token.mjs'

const convertCharTable = new Map<number, string>([
    // ハイフンへの変換
    // 参考) https://hydrocul.github.io/wiki/blog/2014/1101-hyphen-minus-wave-tilde
    // 0x2d: true, // ASCIIのハイフン
    [0x2010, '-'], // 別のハイフン
    [0x2011, '-'], // 改行しないハイフン
    [0x2013, '-'], // ENダッシュ
    [0x2014, '-'], // EMダッシュ
    [0x2015, '-'], // 全角のダッシュ
    [0x2212, '-'], // 全角のマイナス
    // チルダの変換
    // 0x7e: true,
    [0x02dc, '~'], // 小さなチルダ
    [0x02F7, '~'], // Modifier Letter Low Tilde
    [0x2053, '~'], // Swung Dash - 辞書のみだし
    [0x223c, '~'], // Tilde Operator: 数学で Similar to
    [0x301c, '~'], // Wave Dash(一般的な波ダッシュ)
    [0xFF5E, '~'], // 全角チルダ
    // スペースの変換
    // 参考) http://anti.rosx.net/etc/memo/002_space.html
    // 0x20: true,
    [0x2000, ' '], // EN QUAD
    [0x2002, ' '], // EN SPACE
    [0x2003, ' '], // EM SPACE
    [0x2004, ' '], // THREE-PER-EM SPACE
    [0x2005, ' '], // FOUR-PER-EM SPACE
    [0x2006, ' '], // SIX-PER-EM SPACE
    [0x2007, ' '], // FIGURE SPACE
    [0x2009, ' '], // THIN SPACE
    [0x200A, ' '], // HAIR SPACE
    [0x200B, ' '], // ZERO WIDTH SPACE
    [0x202F, ' '], // NARROW NO-BREAK SPACE
    [0x205F, ' '], // MEDIUM MATHEMATICAL SPACE
    [0x3000, ' '], // 全角スペース
    [0x3164, ' '], // HANGUL FILLER
    // その他の変換
    // [0x09, ' '], // TAB --> SPC
    [0x203B, '#'], // '※' --- コメント
    [0x3002, ';'], // 句点
    [0x3010, '['], // '【'
    [0x3011, ']'], // '】'
    // 読点は「,」に変換する (#877)
    [0x3001, ','], // 読点 --- JSON記法で「,」と「、」を区別したいので読点は変換しないことに。(#276)
    [0xFF0C, ','], // 読点 '，' 論文などで利用、ただし句点はドットと被るので変換しない (#735)
    [0x2716, '*'], // ×の絵文字 (#1183)
    [0x2795, '+'], // +の絵文字 (#1183)
    [0x2796, '-'], // -の絵文字 (#1183)
    [0x2797, '÷'] // ÷の絵文字 (#1183)
])

/**
 * @summary １文字を正規化して返す
 * @description
 * chの先頭１文字を変換して以下に従い正規化する。  
 * ・半角に変換可能な文字を半角にする。  
 * ・同一視したい文字を一方に寄せる。
 * @param {string} ch - 正規化する文字。先頭の１文字のみが対象
 * @returns {string} 正規化した文字
 */
function convert1ch(ch: string): string {
    if (!ch) { return '' }
    const c: number = ch.codePointAt(0) || 0
    // テーブルによる変換
    const c2: string = convertCharTable.get(c) || ''
    if (c2) { return c2 }
    // ASCIIエリア
    if (c < 0x7F) { return ch }
    // 全角半角単純変換可能 --- '！' - '～'
    if (c >= 0xFF01 && c <= 0xFF5E) {
        const c2 = c - 0xFEE0
        return String.fromCodePoint(c2)
    }
    return ch
}

/**
 * @summary 文字列を正規化する。
 * @description
 * 文字列を以下に従い正規化して返す。
 * ・各文字に１文字変換用の関数を適用する。
 * ・改行として扱う\r\n,\r,\nを\nに変換して統一する。
 * @param {string} code - 正規化する文字列
 * @returns {return} 正規化した文字列
 */
export function convert(code: string): string {
    if (!code) { return code }
    // 改行コードを統一
    code.replaceAll('\r\n', '\n')
    code.replaceAll('\r', '\n')

    let str = '' // 文字列リテラルの値

    // 一文字ずつ全角を半角に置換する
    for (let i = 0; i < code.length; i++) {
        const c = code.charAt(i)
        const c1 = convert1ch(c)
        // 変換したものを追加
        str = str + c1
    }
    return str
}

export function trimOkurigana (str: string): string {
    if (str == null) {
        return str
    }
    // ひらがなから始まらない場合、送り仮名を削除。(例)置換する
    if (!lexRulesRE.hira.test(str)) {
        return str.replace(/[ぁ-ん]+/g, '')
    }
    // 全てひらがな？ (例) どうぞ
    if (lexRulesRE.allHiragana.test(str)) { return str }
    // 末尾のひらがなのみ (例)お願いします →お願
    return str.replace(/[ぁ-ん]+$/g, '')
}

/**
 * ファイル名からモジュール名へ変換
 * @param {string} filename
 * @returns {string}
 */
export function filenameToModName(filename: string, link: ModuleLink): string {
    if (!filename) {
        return 'main'
    }
    // パスがあればパスを削除
    filename = filename.replace(/[\\:]/g, '/') // Windowsのpath記号を/に置換
    if (filename.indexOf('/') >= 0) {
        const a = filename.split('/')
        filename = a[a.length - 1]
    }
    filename = filename.replace(/\.nako3?$/, '')
    return filename
}

export function argsToString(args: FunctionArg[]): string {
    const argarray: string[][] = []
    for (const arg of args) {
        let i = 0
        for (const josi of arg.josi) {
            if (typeof argarray[i] === 'undefined') {
                argarray[i] = []
            }
            argarray[i].push(`${arg.varname}${josi}`)
            i++
        }
    }
    const arglist: string[] = []
    for (const arg of argarray) {
        arglist.push(arg.join(''))
    }
    return arglist.join('/')
}

export function argsFromString(argstr: string): FunctionArg[] {
    const orderKey: string[] = []
    const argmap = new Map<string, FunctionArg>()
    const args: FunctionArg[] = []
    for (const arglist of argstr.split('/')) {
        for (const r of arglist.matchAll(/([^ぁ-ん]+)([ぁ-ん]*)/g)) {
            let varname = r[1]
            let josi = r[2]
            if (!orderKey.includes(varname)) {
                orderKey.push(varname)
                argmap.set(varname, {
                    varname,
                    josi: [],
                    attr: [],
                    range: null
                })
            }
            const arg = argmap.get(varname)!
            if (!arg.josi.includes(josi)) {
                arg.josi.push(josi)
            }
        }
    }
    for (const key of orderKey) {
        args.push(argmap.get(key)!)
    }
    return args
}

export function getScopeId (index: number, scopeList: ScopeIdRange[]): string {
    let scopeId: string = 'global'
    let currentLength: number = 0
    for (const scope of scopeList) {
        if (scope[2] < index) {
            continue
        }
        if (index >= scope[1] && index <= scope[2] && (currentLength === 0 || scope[2] - scope[1] < currentLength)) {
            scopeId = scope[0]
            currentLength = scope[2] - scope[1]
        }
    }
    return scopeId
}

export function dumpScopIdList (scopeList: ScopeIdRange[], tokens : Token[]) {
    for (const scope of scopeList) {
        const scopeId = scope[0]
        const scopeStartIndex = scope[1]
        const scopeEndIndex = scope[2]
        console.log(`${scopeId}:${tokens[scopeStartIndex].startLine}:${tokens[scopeStartIndex].startCol} - ${tokens[scopeEndIndex].endLine}:${tokens[scopeEndIndex].endCol}`)
    }
}

/**
 * @summary ""もしくは''によるクォーティングを外す。無ければそのまま返す。
 * @param {string} str
 * @returns {string}
 */
export function trimQuote (str: string): string {
    if (str === '""' || str === "''") {
        return ''
    } else if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
        return str.substring(1, str.length - 1)
    }
    return str
}


export function mergeNakoRuntimes(nakoRuntime: NakoRuntime[]|'invalid', runtimes: NakoRuntime[]|'invalid'|undefined):NakoRuntime[]|'invalid' {
    if (runtimes && runtimes.length > 0) {
        if (nakoRuntime.length === 0) {
            nakoRuntime = runtimes
        } else if (runtimes === 'invalid') {
            nakoRuntime = runtimes
        } else if (nakoRuntime === 'invalid' || nakoRuntime.join(',') === runtimes.join(',')) {
            // nop
        } else {
            const r2: NakoRuntime[] = []
            for (const r of runtimes) {
                if (nakoRuntime.includes(r)) {
                    r2.push(r)
                }
            }
            if (r2.length === 0) {
                nakoRuntime = 'invalid'
            } else {
                nakoRuntime = r2
            }
        }
    }
    return nakoRuntime
}