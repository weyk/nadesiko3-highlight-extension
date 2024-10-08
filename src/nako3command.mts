import { Uri } from 'vscode'

import path from 'node:path'
import fs from 'node:fs/promises'

import { ModuleLink } from './nako3module.mjs'
import { logger } from './logger.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { Nako3TokenTypePlugin } from './nako3token.mjs'
import { argsFromString } from './nako3util.mjs'
import { nadesiko3 } from './nako3nadesiko3.mjs'

import type { DeclareFunction, DeclareVariable,  DeclareThings } from './nako3types.mjs'

import commandjson from './nako3/command.json'

type CmdSectionEntry = [string, string, string, string, string]
type CmdPluginEntry = { [sectionName:string] : CmdSectionEntry[] }
type CmdJsonEntry = { [pluginName:string]: CmdPluginEntry }

export interface CommandInfo {
    pluginName: string
    command: string
    args: string
    hint: string
    type: Nako3TokenTypePlugin
}

export type CommandEntry = Map<string, CommandInfo>    

const pluginRuntimes = new Map<string, string>(
    [
        ["plugin_system", 'wnako,cnako,phpnako'],
        ["plugin_csv", 'wnako,cnako'],
        ["plugin_math", 'wnako,cnako'],
        ["plugin_promise", 'wnako'],
        ['plugin_browser','wnako'],
        ['plugin_turtle', 'wnako'],
        ['plugin_node', 'cnako,phpnako'],
        ['plugin_httpserver', 'cnako'],
        ['plugin_markup', 'wnako,cnako'],
        ['plugin_datetime', 'wnako,cnako'],
        ['plugin_caniuse', 'wnako,cnako'],
        ['plugin_kansuji', 'wnako,cnako'],
        ['plugin_weykturtle3d', 'wnako'],
        ['plugin_webworker', 'wnako'],
        ['nadesiko3-music', 'wnako'],
        ['nadesiko3-tools', 'cnako'],    
        ['nadesiko3-server', 'cnako'],
        ['nadesiko3-sqlite3', 'cnako'],    
        ['nadesiko3-htmlparser', 'cnako'],
        ['nadesiko3-websocket', 'cnako'],
        ['nadesiko3-ml', 'cnako'],
        ['nadesiko3-mecab', 'cnako'],
        ['nadesiko3-smtp', 'cnako'],
        ['nadesiko3-office', 'cnako'],
        ['nadesiko3-odbc', 'cnako'],
        ['nadesiko3-mssql', 'cnako'],
        ['nadesiko3-mysql', 'cnako'],
        ['nadesiko3-postgresql', 'cnako'],
        ['nadesiko3php', 'phpnako'],
        ['nadesiko3electron', 'enako'],
    ]
)
const runtimePlugins:{[runtime:string]: string[]} = {
    snako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_snako'],
    cnako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_node'],
    wnako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_browser']
}

const commandSnakoJson = {
    "plugin_snako": {
        "SNAKO": [
            ["定数","コマンドライン","","''","こ"],
            ["定数","ナデシコランタイムパス","","''","な"],
            ["定数","ナデシコランタイム","","''","な"],
            ["定数","母艦パス","","''","ぼ"],
            ["関数","読","Fを/Fから","ファイルFの内容を読む","た"],
            ["関数","開","Fを/Fから","ファイルFの内容を読む","ひ"],
            ["関数","保存","SをFに/Fへ","文字列SをファイルFに保存","ほ"],
            ["関数","起動待機","Sを","シェルコマンドSを起動し実行終了まで待機する","き"],
            ["関数","ファイル名抽出","Sから/Sの","ルパスのファイル名Sからファイル名部分を抽出して返す","ふ"],
            ["関数","パス抽出","Sから/Sの","ファイル名Sからパス部分を抽出して返す存","ぱ"],
            ["関数","絶対パス変換","Aを/Aの","相対パスから絶対パスに変換して返す","ぜ"],
            ["関数","相対パス展開","AをBで","ファイル名AからパスBを展開して返す","そ"],
        ]
    }
}

interface OperatorHint {
    cmd: string[]
    hint: string
}

export const operatorCommand = new Map<string, OperatorHint>([
  ['and',  { cmd: ['AかつB', 'A&&B'], hint: '論理演算子としてはAかBの両方が真ならば真を返す\n具体的な動作はAが偽と評価できる場合はAを返しそうではない場合はBを返す'}],
  ['or', { cmd: ['AまたはB', 'A||B'], hint: '論理演算子としてはAかBのいずれかが真ならば真を返す\nA具体的な動作はAが真と評価できる場合はAを返しそうではない場合はBを返す'}],
  ['eq', { cmd: ['A=B', 'A==B'], hint: '代入もしくは比較する。比較の場合はAとBが等しいかどうかを緩く比較し等しいと見なせれば真を返す。等しいと見なせないならば偽を返す\n『もし』構文の条件式でのみ『=』の替りに『が』を用いることも出来る'}],
  ['noteq', { cmd: ['A!=B', 'A<>B', 'A≠B'], hint: '比較する。AとBが等しいかどうかを緩く比較し等しいと見なせれば真を返す。等しいと見なせないならば偽を返す'}],
  ['===', { cmd: ['A===B'], hint: '比較する。AとBが等しいかどうかを厳密に比較し等しければ真を返す。等しくなければ偽を返す'}],
  ['!==', { cmd: ['A!==B'], hint: '比較する。AとBが等しいく無いかどうかを厳密に比較し等しくなければ真を返す。等しければ偽を返す'}],
  ['gt', { cmd: ['A>B'], hint: '比較する。AがBより大きい場合に真を返す。AがB以下ならば偽を返す'}],
  ['gteq', { cmd: ['A>=B', 'A≧B'], hint: '比較する。AがB以上ならば真を返す。AがB未満ならば偽を返す'}],
  ['lt', { cmd: ['A<B'], hint: '比較する。AがBより小さい場合に真を返す。そうではない場合は偽を返す'}],
  ['lteq', { cmd: ['A<=B', 'A≦B'], hint: '比較する。AがB以下ならば真を返す。AがBより大きければ偽を返す'}],
  ['&', { cmd: ['A&B'], hint: '文字列の連結。Aに続く形でBを連結した文字列を返す'}],
  ['+', { cmd: ['A+B'], hint: '加算。AとBの和を返す'}],
  ['-', { cmd: ['A-B'], hint: '減算。AからBを引いた差を返す'}],
  ['shift_l', { cmd: ['A<<B'], hint: 'ビット操作。Aを左にBビットシフトした値を返す。ずらした分は0が詰められる\nこの操作はAに2^Bを乗ずるのに等しい'}],
  ['shift_r', { cmd: ['A>>B'], hint: 'ビット操作。Aを右にBビットシフトした値を返す。ずらした分は最上位ビットと同じ値が詰められる\nこの操作はAを2^Bで除するのに等しい。Aの符号付き整数として使われる'}],
  ['shift_r0', { cmd: ['A>>>B'], hint: 'ビット操作。Aを右にBビットシフトした値を返す。ずらした分は0が詰められる\nこの操作はAを2^Bで除するのに等しい。Aの符号なし整数として扱われる'}],
  ['*', { cmd: ['A*B', 'A×B'], hint: '乗算。AとBを掛けた積を返す'}],
  ['/', { cmd: ['A/B', 'A÷B'], hint: '除算。AをBで割った商を返す\n両辺が整数でも実数計算となる'}], // 一般的な割り算
  ['÷', { cmd: ['A/B', 'A÷B'], hint: '除算。AをBで割った商を返す\n両辺が整数でも実数計算となる'}], // 一般的な割り算
  ['÷÷', { cmd: ['A÷÷B'], hint: '整数除算。AをBで割った商を整数で返す'}], // 整数の割り算(商)
  ['%', { cmd: ['A%B'], hint: '整数の剰余。AをBで割った余り返す'}], // 整数の割り算(余り)
  ['^', { cmd: ['A^B', 'A**B'], hint: 'べき乗を計算する。AのB乗を返す'}],
  ['**', { cmd: ['A^B', 'A**B'], hint: 'べき乗を計算する。AのB乗を返す'}]
])

interface FileContent {
    filepath: string
    exists: boolean
    text: string
}
export class Nako3Command {
    commands: Map<string, DeclareThings>

    constructor () {
        this.commands = new Map()
    }

    initialize () {
        logger.debug(`convert built-in plugin`)
        this.importCommandJson(commandjson as unknown as CmdJsonEntry)
        this.importCommandJson(commandSnakoJson as unknown as CmdJsonEntry)
        for (const runtime of ['snako','cnako','wnako']) {
            const plugins = runtimePlugins[runtime]
            const entry: DeclareThings  = new Map()
            for (const pluginName of plugins) {
                const commandEntry = this.commands.get(pluginName)
                if (commandEntry) {
                    for (const [command, commandInfo] of commandEntry) {
                        entry.set(command, commandInfo)
                    }
                }
            }
            this.commands.set(`runtime:${runtime}`, entry)
        }
    }

    private importCommandJson (json: CmdJsonEntry):void {
        for (const pluginName of Object.keys(json)) {
            logger.debug(`  plugin name:${pluginName}`)
            const plugin = json[pluginName]
            for (const sectioname of Object.keys(plugin)) {
                const section = plugin[sectioname]
                for (const entry of section) {
                    const rawType = entry[0] 
                    const command = entry[1]
                    const args = entry[2]
                    const hint = entry[3]
                    let type:'func'|'var'|'const'
                    let commandEntry: DeclareThings
                    if (this.commands.has(pluginName)) {
                        commandEntry = this.commands.get(pluginName)!
                    } else {
                        commandEntry = new Map()
                        this.commands.set(pluginName, commandEntry)
                    }
                    if (rawType === '関数') {
                        const func: DeclareFunction = {
                            name: command,
                            nameNormalized: command,
                            modName: '',
                            type: 'func',
                            isPure: true,
                            isMumei: false,
                            isAsync: false,
                            isExport: true,
                            isPrivate: false,
                            isVariableJosi: false,
                            hint,
                            args: argsFromString(args)
                        }
                        commandEntry.set(command, func)
                    } else if (rawType === '定数' || rawType === '変数') {
                        type = rawType === '定数' ? 'const' : 'var'
                        const varConst: DeclareVariable = {
                            name: command,
                            nameNormalized: command,
                            modName: '',
                            type,
                            isExport: true,
                            isPrivate: false,
                            hint
                        }
                        commandEntry.set(command, varConst)
                    } else {
                        logger.error(`nako3command: unknwon type(${rawType}) in ${plugin}`)
                    }
                }
            }
        }
    }

    async importFromFile (pluginName: string, link: ModuleLink, errorInfos: ErrorInfoManager) {
        let fpath:string
        if (pluginName.startsWith('http://') || pluginName.startsWith('https://')) {
            // absolute uri
            errorInfos.add('WARN','unsupportImportFromRemote', { plugin: pluginName }, 0,0,0,0)
            return
        }
        logger.debug(`importFromFile:${pluginName}`)
        const f = this.searchPlugin(pluginName, link)
    }

    async tryReadFile(filepath: string):Promise<FileContent> {
        const content:FileContent = {
            filepath: filepath,
            text: '',
            exists: false
        }
        try {
            const text = await fs.readFile(filepath, { encoding: 'utf-8' })
            content.text = text
            content.exists = true
        } catch (err) {
            // nop
        }
        return content
    }

    async checkpluginFile(pathName:string): Promise<FileContent> {
        // 拡張子付きならそのままファイル名として存在チェック
        if (/\.(js|mjs|cjs)$/.test(pathName)) {
            const content = await this.tryReadFile(pathName)
            if (content.exists) {
                return content
            }
        }
        // ディレクトリと仮定してpackage.jsonがあるかチェック
        const jsonFile = path.join(pathName, 'package.json')
        const jsonContent = await this.tryReadFile(jsonFile)
        if (jsonContent.exists) {
            // package.jsonがありmainがあるならファイル名として読んでみる
            const jsonJson = JSON.parse(jsonContent.text)
            if (jsonJson.main) {
                const mainFile = path.join(pathName, jsonJson.main)
                const mainContent = await this.tryReadFile(mainFile)
                if (mainContent.exists) {
                    return mainContent
                }
            }
        }
        return {
            filepath: pathName, text: '', exists: false
        }
    }

    async searchPlugin (plugin: string, link: ModuleLink): Promise<FileContent> {
        const ngFileContent: FileContent = {
            filepath : plugin,
            exists: false,
            text: ""
        }
        const nako3home = await nadesiko3.getNako3Home()
        logger.debug(`searchPlugin:home:${nako3home}`)
        // HTTPによるURL
        if (plugin.startsWith('https://') || plugin.startsWith('http://')) {
            try {
                const response = await fetch(plugin)
                const text = await response.text()
                logger.info(`searchPlugin:find at url`)
                return {
                    filepath: plugin,
                    exists: true,
                    text: text
                }
            } catch (err) {
                // nop
                return ngFileContent
            }
        }
        // ローカルのフルパス指定
        if (plugin.startsWith('/') || /[A-Za-z]:\\/.test(plugin) || plugin.startsWith('file:/')) {
            logger.debug(`searchPath:check local absulute path`)
            const f = await this.checkpluginFile(plugin)
            if (f.exists) {
                logger.info(`searchPlugin:find at absolute path`)
                return f
            } else {
                return ngFileContent
            }
        }
        // 相対パス
        if (plugin.startsWith('./') || plugin.startsWith('../')) {
            logger.debug(`searchPath:check local relative path`)
            const fpath = path.join(path.resolve(path.dirname(link.filePath), plugin))
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at sourve relative path`)
                return f
            } else {
                return ngFileContent
            }
        }
        // スキーマ・絶対パス・相対パスのいずれでもない場合
        // nako3ファイルと同じ場所をチェック(./と同じ)
        {
            const fpath = path.join(path.resolve(path.dirname(link.filePath), plugin))
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at sourve relative path`)
                return f
            }
        }
        // 指定が特定の条件に合うときのみcnako3のラインタイムをチェック
        if (/^plugin_[a-z09_]+\.m?js/.test(plugin) && nako3home !== '') {
            // cnako3のラインタイムのsrc以下をチェック
            {
                const fpath = path.join(nako3home, 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/src`)
                    return f
                }
            }
            // cnako3のラインタイムのcore/src以下をチェック
            {
                const fpath = path.join(nako3home, 'core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/core/src`)
                    return f
                }
            }
        }
        // NAKO_LIB以下をチェック
        if (process.env.NAKO_LIB) {
            const fpath = path.join(process.env.NAKO_LIB, plugin)
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at NAKO_LIB`)
                return f
            }
        }
        if (nako3home !== '') {
            {
                const fpath = path.join(nako3home, 'node_modules', plugin)
                logger.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, '..', plugin)
                logger.debug(`searchPlugin:check(${fpath})`)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/..`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
            {
                const fpath = path.join(nako3home, 'node_modules', 'nadesiko3core', 'src', plugin)
                const f = await this.checkpluginFile(fpath)
                if (f.exists) {
                    logger.info(`searchPlugin:find at nadesiko3/node_modules/nadesiko3core/src`)
                    return f
                }
            }
        }
        // NAKO_LIB以下をチェック
        if (process.env.NODE_PATH) {
            const fpath = path.join(process.env.NODE_PATH, plugin)
            const f = await this.checkpluginFile(fpath)
            if (f.exists) {
                logger.info(`searchPlugin:find at NODE_PATH`)
                return f
            }
        }
        return ngFileContent
    }

    getRuntimesFromPlugin (plugin: string): string|undefined {
        return pluginRuntimes.get(plugin) 
    }

    has (plugin: string): boolean {
        return this.commands.has(plugin)
    }

    get (plugin: string): DeclareThings|undefined {
        return this.commands.get(plugin)
    }
}
