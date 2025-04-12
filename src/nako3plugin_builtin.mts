import { argsFromString, trimQuote } from './nako3util.mjs'
import { nako3plugin, PluginInfo } from './nako3plugin.mjs'
import { cssColor } from './csscolor.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, GlobalFunction, GlobalVariable, GlobalConstant } from './nako3types.mjs'

import commandjson from './nako3/command.json'

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

const pluginRuntimes = new Map<string, string>(
    [
        ["plugin_system", 'wnako,cnako,phpnako'],
        ["plugin_csv", 'wnako,cnako'],
        ["plugin_math", 'wnako,cnako'],
        ["plugin_promise", 'wnako'],
        ['plugin_browser','wnako'],
        ['plugin_turtle', 'wnako'],
        ['plugin_node', 'cnako,phpnako'],
        ['plugin_snako', 'snako'],
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

const pluginsInNakoruntime:{[runtime:string]: string[]} = {
    snako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_snako'],
    cnako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_node'],
    wnako: ['plugin_system', 'plugin_math', 'plugin_promise', 'plugin_test', 'plugin_csv', 'plugin_browser']
}

type CmdSectionEntry = [string, string, string, string, string]
type CmdPluginEntry = { [sectionName:string] : CmdSectionEntry[] }
type CmdJsonEntry = { [pluginName:string]: CmdPluginEntry }

export function initialize () {
    const log = logger.fromKey('/nako3plugin_bultin.initialize')
    log.debug(`convert built-in plugin`)
    importCommandJson(commandjson as unknown as CmdJsonEntry)
    importCommandJson(commandSnakoJson as unknown as CmdJsonEntry)
    nako3plugin.setPluginsInNakoruntime(pluginsInNakoruntime)
}

function importCommandJson (json: CmdJsonEntry):void {
    const log = logger.fromKey('/nako3plugin_bultin.importCommandJson')
    for (const pluginName of Object.keys(json)) {
        log.debug(`  plugin name:${pluginName}`)
        const plugin = json[pluginName]
        const nakoRuntime = pluginRuntimes.get(pluginName)
        const pluginInfo: PluginInfo = {
            pluginName: pluginName,
            location: 'builtin',
            uri: null,
            contentKey: '',
            nakoRuntime: nakoRuntime != null ? nakoRuntime.split(',') as NakoRuntime[] : [],
            declare: new Map()
        }
        let commandEntry = pluginInfo.declare
        for (const sectioname of Object.keys(plugin)) {
            const section = plugin[sectioname]
            for (const entry of section) {
                const rawType = entry[0] 
                const command = entry[1]
                const args = entry[2]
                const hint = entry[3]
                let type:'func'|'var'|'const'
                if (rawType === '関数') {
                    const func: GlobalFunction = {
                        name: command,
                        nameNormalized: command,
                        modName: pluginName,
                        type: 'func',
                        isPure: true,
                        isMumei: false,
                        isAsync: false,
                        isExport: true,
                        isPrivate: false,
                        isVariableJosi: false,
                        hint,
                        args: argsFromString(args),
                        range: null,
                        scopeId: null,
                        origin: 'plugin',
                        isRemote: false,
                        activeDeclare: true
                    }
                    commandEntry.set(command, func)
                } else if (rawType === '定数' || rawType === '変数') {
                    type = rawType === '定数' ? 'const' : 'var'
                    let isColor = type === 'const' && cssColor.isColorName(trimQuote(hint))
                    const varConst = {
                        name: command,
                        nameNormalized: command,
                        modName: pluginName,
                        isExport: true,
                        isPrivate: false,
                        hint,
                        range: null,
                        origin: 'plugin' as 'plugin',
                        isRemote: false,
                        isColor,
                        activeDeclare: true
                    }
                    if (type === 'const') {
                        const v: GlobalConstant = {
                            type: 'const',
                            value: hint,
                            ...varConst
                        }
                        commandEntry.set(command, v)
                    } else {
                        const v: GlobalVariable = {
                            type: 'var',
                            ...varConst
                        }
                        commandEntry.set(command, v)
                    }
                } else {
                    log.error(`nako3plugin: unknwon type(${rawType}) in ${plugin}`)
                }
            }
        }
        nako3plugin.plugins.set(pluginName, pluginInfo)
    }
}

