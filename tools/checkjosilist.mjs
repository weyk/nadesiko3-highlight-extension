#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs/promises'
import process from 'node:process'

const rootDir = path.resolve('.')
const srcDir = path.join(rootDir, 'src')

async function existDirectory(filepath) {
    try {
        const f = await fs.stat(filepath)
        return f.isDirectory
    } catch (ex) {
        // nop
    }
    return false
}

async function checkHaTilde(filename) {
    const text = await fs.readFile(filename, { encoding: 'utf-8' })
    const lines = text.split(/\r|\n/)
    let hasHaTilde = false
    for (const line of lines) {
        if (/("は～"|'は～')/.test(line)) {
            hasHaTilde = true
        }
    }
    if (!hasHaTilde) {
        console.error('src/nako3/nako_josi_list.mtsのjosi_listに「は～」がありません。')
        console.error('本プログラムでは事前に全角→半角の変換処理を行わないため、「は~」に対応する全角版の「は～」をjosi_listに追加する必要があります。')
        console.error('josi_listの配列の「は~」の前後いずれかに「は～」を追加して再度ビルドしてください。')
        return 1
    }
    return 0
}

const srcfile = path.join(srcDir, 'nako3', 'nako_josi_list.mts')
process.exitCode = await checkHaTilde(srcfile)
