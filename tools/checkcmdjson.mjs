import path from 'node:path'
import fs from 'node:fs/promises'

const pluginNumber = 31

async function checkCommandJson(filename) {
    const text = await fs.readFile(filename, { encoding: 'utf-8' })
    const json = JSON.parse(text)
    const pluginCount = Object.keys(json).length
    if (pluginCount === 0) {
        console.error('src/nako3/command.jsonにpluginが1つも含まれていません。')
        return 1
    }
    if (pluginCount !== pluginNumber) {
        console.error(`src/nako3/command.jsonに含まれるプラグインの数(${pluginCount})が想定(${pluginNumber})と異なります。`)
        console.error('恒久的な変更であるならチェックスクリプトを修正してください。')
        return 1
    }
    let totalCount = 0
    for (const [ pluginkey, plugin ] of Object.entries(json)) {
        if (Object.keys(plugin).length === 0) {
            console.error('src/nako3/command.jsonに命令グループを1つも含まないpluginがあります。')
            console.error(`plugin名=${pluginkey}`)
            return 1
        }
        let countInPlugin = 0
        for (const [ seckey, sec ] of Object.entries(plugin)) {
            const count = Object.keys(sec).length
            if (count === 0) {
                if (pluginkey === 'plugin_electron_node' && (seckey === 'ElectronのNode側の標準機能セット' || seckey === 'Electronのshell')) {
                    // no-entry
                } else {
                    console.error('src/nako3/command.jsonに定義を1つも含まない命令グループがあります。')
                    console.error(`plugin名=${pluginkey}, 命令グループ=${seckey}`)
                    return 1
                }
            } else {
                if (pluginkey === 'plugin_electron_node' && (seckey === 'ElectronのNode側の標準機能セット' || seckey === 'Electronのshell')) {
                    // no-entry
                    console.error('src/nako3/command.jsonに定義を含まないはずの命令グループに命令が含まれています。')
                    console.error(`plugin名=${pluginkey}, 命令グループ=${seckey}`)
                    console.error('恒久的なpluginの更新であるならチェックスクリプトを修正してください。')
                    return 1
                }
            }
            countInPlugin += count
        }
        totalCount += countInPlugin
    }
    return 0
}

const result = await checkCommandJson(path.resolve('src','nako3','command.json'))
process.exitCode = result
