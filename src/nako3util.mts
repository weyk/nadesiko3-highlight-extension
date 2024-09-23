import { lexRulesRE } from './nako3lexer_rule.mjs'
import { ModuleLink } from './nako3module.mjs'

export function trimOkurigana (str: string): string {
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