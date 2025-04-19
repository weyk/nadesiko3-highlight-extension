#!/usr/bin/env node

console.log('top of file')
import path from 'node:path'
import fs from 'node:fs/promises'

import { argsToString, argsFromString } from '../nako3util.mjs'
import { logger } from '../logger.mjs'
import { Nako3PluginParser, PluginContent } from '../nako3plugin_parser.mjs'

logger.setLevel('DEBUG')
const logBase = logger.fromKey('/tools/gencmdjson')
const pluginParser = new Nako3PluginParser()
const opts = { isRemote: false }

async function parsePlugin(filePath: string): Promise<boolean> {
    const log = logBase.appendKey('#parsePlugin')
    log.info(`start file = ${filePath}`)
    const text = await fs.readFile(filePath, { encoding: 'utf-8' })
    const result = pluginParser.parsePlugin(text, opts)
    if (result === null || result?.declare.size === 0) {
        log.error(``)
        throw new Error(`定義内容の取得に失敗しました(${path.basename(filePath)})`)
    }
    // console.log('%o', result)
    /* for (const [k,v] of result.declare) {
        log.debug(k)
        log.debug(v.name)
        if (v.type === 'func' && v.args) {
            log.debug(v.args)
            log.debug(argsToString(v.args))
            log.debug(argsFromString(argsToString(v.args)))
        }
    }*/
    log.info(`end`)
    return true
2}

async function parsePluginInFolder(filename: string, folder: string): Promise<void> {
    const log = logBase.appendKey('#parsePluginInFolder')
    log.info(`start folder = ${folder}  filename = ${filename}`)
    const filePath = path.resolve(folder, filename)
    await parsePlugin(filePath)
    log.info(`end`)
}

async function parsePluginsInFolder(filenames: string[], folder: string): Promise<void> {
    const log = logBase.appendKey('#parsePluginsInFolder')
    log.info(`start folder = ${folder}`)
    for (const filename of filenames) {
        await parsePluginInFolder(filename, folder)
    }
    log.info(`end`)
}

async function main() {
    const log = logBase.appendKey('#main')
    let folder:string
    let filenames:string[]

    log.info(`start`)
    // nadesiko3に付属するプラグイン
    folder = path.join('node_modules','nadesiko3','core','src')
    filenames = [
        // 'plugin_system.mts',
        'plugin_promise.mts',
        // 'plugin_csv.mts',
        // 'plugin_test.mts'
    ]
    await parsePluginsInFolder(filenames, folder)

    folder = path.join('node_modules','nadesiko3','src')
    log.info(`end`)
}

await main()
