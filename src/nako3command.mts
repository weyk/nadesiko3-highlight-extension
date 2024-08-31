import commandjson from './nako3/command.json'
import { logger } from './logger.mjs'

type CmdSectionEntry = [string, string, string, string, string]
type CmdPluginEntry = { [sectionName:string] : CmdSectionEntry[] }
type CmdJsonEntry = { [pluginName:string]: CmdPluginEntry }

export interface CommandInfo {
    pluginName: string
    command: string
    args: string
    hint: string
    type: string
}

export type CommandEntry = Map<string, CommandInfo>    

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

export class Nako3Command {
    commands: Map<string, CommandEntry>

    constructor () {
        this.commands = new Map()
    }

    initialize () {
        logger.debug(`convert built-in plugin`)
        this.importCommandJson(commandjson as unknown as CmdJsonEntry)
        this.importCommandJson(commandSnakoJson as unknown as CmdJsonEntry)
        for (const runtime of ['snako','cnako','wnako']) {
            const plugins = runtimePlugins[runtime]
            const entry = new Map()
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
                    let type = entry[0] 
                    const command = entry[1]
                    const args = entry[2]
                    const hint = entry[3]
                    if (type === '定数') {
                        type = 'システム定数'
                    } else if (type === '関数') {
                        type = 'システム関数'
                    } else if (type === '変数') {
                        type = 'システム変数'
                    }
                    const commandInfo: CommandInfo = {
                        pluginName,
                        command,
                        args,
                        hint,
                        type
                    }
                    let commandEntry: CommandEntry
                    if (this.commands.has(pluginName)) {
                        commandEntry = this.commands.get(pluginName)!
                    } else {
                        commandEntry = new Map()
                        this.commands.set(pluginName, commandEntry)
                    }
                    commandEntry.set(command, commandInfo)
                }
            }
        }
    }

    get (plugin: string):CommandEntry|undefined {
        return this.commands.get(plugin)
    }
}
