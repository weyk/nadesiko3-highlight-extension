import { trimOkurigana, trimQuote } from './nako3util.mjs'
import { Nako3Range } from './nako3range.mjs'
import { cssColor } from './csscolor.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime, GlobalFunction, GlobalVarConst, DeclareThing, DeclareThings, FunctionArg } from './nako3/nako3types.mjs'

interface PluginMeta {
    pluginName: string
    description: string
    nakoRuntime: NakoRuntime[]
}

export interface PluginContent {
    meta: PluginMeta
    declare: DeclareThings
}

interface parseOption {
    isRemote: boolean
    [key:string]:any
}

export class Nako3PluginParser {
    protected log = logger.fromKey('/Nako3PluginParser')

    public parsePlugin (text: string, opts: parseOption): PluginContent|null {
        let result:PluginContent|null = null
        try {
            result = this.parseWelformedPlugin(text, opts)
            if (!result || result.declare.size === 0) {
                result = this.parseMinifiedPlugin(text, opts)
             }
        } catch (err) {
            console.log(`error in parse`)
            console.log(err)
            result = null
        }
        return result
    }

    private parseMinifiedPlugin (text: string, opts: parseOption): PluginContent|null {
        const log = this.log.appendKey('.parseMinifiedPlugin')
        const plugin: PluginContent = {
            meta:{ pluginName: '', description: '', nakoRuntime: [] },
            declare: new Map()
        }
        const meta = plugin.meta
        const commandEntry = plugin.declare
        try {
            let r: RegExpExecArray|null
            // metaタグをチェック
            r = /meta:\{type:"const",value:\{([^\}]*)\}\}/.exec(text)
            if (r && r.length > 1 && r[1] != null) {
                const metastr = r[1]
                for (const m of metastr.matchAll(/([a-zA-Z]+):("([^"]+)"|\[[^\]]\]*\])/g)) {
                    if (m && m.length > 2 && m[1] != null && m[2] != null) {
                        const key = m[1].trim()
                        const v = m[3] != null ? m[3].trim() : m[2].trim()
                        if (key === 'pluginName') {
                            meta.pluginName = v
                        } else if (key === 'description') {
                            meta.description = v
                        } else if (key === 'nakoRuntime') {
                            meta.nakoRuntime = JSON.parse(v) as NakoRuntime[]
                        }
                    }
                }
            }
            if (meta.pluginName || meta.description || meta.nakoRuntime) {
                log.info(`meta info found`)
            }

            // 変数・定数の定義を列挙して取り込む
            for (const m of text.matchAll(/("([^"]+)"|[A-Za-z0-9]+):\{type:"(var|const)",value:([^}]*)\}/g)) {
                const name = trimOkurigana(m[2] != null ? m[2].trim() : m[1].trim())
                const type = m[3].trim() as ('var'|'const')
                const v = m[4].trim()
                if (['meta'].includes(name)) {
                    continue
                }
                let isColor = type === 'const' && cssColor.isColorName(trimQuote(v))
                const varible: GlobalVarConst = {
                    name,
                    nameNormalized: name,
                    modName: '',
                    type,
                    isExport: true,
                    isPrivate: false,
                    value: v,
                    hint: v,
                    range: null,
                    origin: 'plugin',
                    isColor,
                    activeDeclare: true,
                    ...opts
                }
                commandEntry.set(name, varible)
            }
            if (commandEntry.size > 0) {
                log.info(`variable / constant found`)
            }

            // 関数の定義を列挙して取り込む
            for (const m of text.matchAll(/("([^"]+)"|[A-Za-z0-9]+):\{(type:"func",[^\{]*)\{/g)) {
                let name = trimOkurigana(m[2] != null ? m[2].trim() : m[1].trim())
                let memo = m[3].trim()
                let info:any = {
                    name,
                    type: '',
                    josi: null,
                    pure: true,
                    asyncFn: false,
                    isVariableJosi: false,
                    desc: '',
                    yomi: '',
                    args: []
                }
                if (['初期化', '!クリア'].includes(info.name)) {
                    continue
                }
                // 定義-type
                r = /type:"([^"]+)",/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.type = r[1].trim()
                }
                // 定義-pure
                r = /pure:([^,]*),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.pure = r[1].trim() === "!0" || r[1].trim() === "true"
                }
                // 定義-isVariableJosi
                r = /isVariableJosi:([^,]*),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.isVariableJosi = r[1].trim() === "!0" || r[1].trim() === "true"
                }
                // 定義-josi
                r = /josi:(\[(\[("[^"]*",?)*\],?)*\]),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    try {
                        info.josi = JSON.parse(r[1].trim().replaceAll("'", '"'))
                    } catch (err) {
                        log.error(`cause error in parse josi`)
                        log.error(err)
                    }
                }
                // 定義-asyncFn
                r = /asyncFn:([^,]*),/.exec(memo)
                if (r && r.length > 1 && r[1] != null) {
                    info.asyncFn = r[1].trim() === "!0" || r[1].trim() === "true"
                }
                // 定義-fn
                r = /fn:(async function|function)(\(.*\).*)/.exec(memo)
                if (r && r.length > 2 && r[2] != null) {
                    let args: FunctionArg[] = []
                    for (let j = 0; j < info.josi.length; j++) {
                        args.push({
                            varname: String.fromCharCode(65 + j),
                            josi: info.josi[j],
                            attr: [],
                            range: null
                        })
                    }
                    info.args = args
                    const func: GlobalFunction = {
                        name: info.name,
                        nameNormalized: info.name,
                        modName: '',
                        type: 'func',
                        isPure: info.pure,
                        isMumei: false,
                        isAsync: info.asyncFn,
                        isExport: true,
                        isPrivate: false,
                        isVariableJosi: info.isVariableJosi,
                        hint: info.desc + ( info.asyncFn ? '(非同期関数)' : '' ) + ( info.isVariableJosi ? '(可変引数)' : '' ),
                        args,
                        range: null,
                        scopeId: null,
                        origin: 'plugin',
                        activeDeclare: true,
                        ...opts
                    }
                    commandEntry.set(info.name, func)
                } else {
                    log.debug(`not match fn`)
                    log.debug(r)
                    log.debug(memo)
                }
            }
        } catch (err) {
            log.error(err)
            return null
        }
        return plugin
    }

    private parseWelformedPlugin (text: string, opts: parseOption): PluginContent|null {
        const log = this.log.appendKey('.parseWelformedPlugin')
        const plugin: PluginContent = {
            meta:{ pluginName: '', description: '', nakoRuntime: [] },
            declare: new Map()
        }
        const meta = plugin.meta
        const commandEntry = plugin.declare
        const lines = text.split(/[\r\n]/)
        if (!lines) {
            return null
        }
        try {
            let currentTitle = ''
            let inMeta = false
            let info:any = {}
            let r: RegExpExecArray|null
            for (let i = 0;i < lines.length; i++) {
                let line = lines[i]
                if (line.length === 0) {
                    continue
                }
                if (inMeta) {
                    r = /^\s*pluginName:\s*'(.*)'/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        meta.pluginName = r[1].trim()
                        continue
                    }
                    r = /^\s*description:\s*'(.*)'/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        meta.description = r[1].trim()
                        continue
                    }
                    r = /^\s*nakoRuntime:\s*(\[.*\])/.exec(line)
                    if (r && r.length > 1 && r[1] != null) {
                        try {
                            meta.nakoRuntime = JSON.parse(r[1].trim().replaceAll("'",'"')) as NakoRuntime[]
                        } catch (err) {
                            log.debug(`cause error on parse nakoRuntime`)
                            console.log(err)
                        }
                        continue
                    }
                    if (/^\s*\},$/.test(line)) {
                        inMeta = false
                        if (meta.pluginName || meta.description || meta.nakoRuntime) {
                            log.info(`meta info found`)
                        } else {
                            log.info(`meta info empty`)
                        }
                    }
                    continue
                }
                if (/^\s*'meta':\s*\{/.test(line)) {
                    inMeta = true
                    log.info(`meta tag found`)
                    continue
                }
                // 見出し行
                r = /^\s*\/\/\s*@(.*)$/.exec(line)
                if (r && r.length > 1 && r[1] != null && !r[1].startsWith('ts-')) {
                    currentTitle = r[1].trim()
                    continue
                }
                // 変数・定数行
                r = /^(\s*)'([^']+)'\s*:\s*\{\s*type\s*:\s*'(const|var)'\s*,\s*value\s*:\s*([^\}]*)\}\s*,\s*(\/\/ @(.*))?$/.exec(line)
                if (r && r.length > 4 && r[1] != null && r[2] != null && r[3] != null && r[4] != null) {
                    const col = r[1].length + 1
                    const resLen = r[2].length
                    const name = trimOkurigana(r[2].trim())
                    const type = r[3].trim() as 'var'|'const'
                    const v = r[4].trim()
                    let isColor = type === 'const' && cssColor.isColorName(trimQuote(v))
                    const yomi = r[6] != null ? r[6].trim() : ''
                    const varible: GlobalVarConst = {
                        name,
                        nameNormalized: name,
                        modName: '',
                        type,
                        isExport: true,
                        isPrivate: false,
                        value: v,
                        hint: v,
                        range: new Nako3Range(i, col, i, col + resLen, col + resLen),
                        origin: 'plugin',
                        isColor,
                        activeDeclare: true,
                        ...opts
                    }
                    commandEntry.set(name, varible)
                    continue
                }
                // 関数定義開始行
                r = /^(\s*)'([^']+)'\s*:\s*(\{|\[)\s*(\/\/\s*@(.+))?$/.exec(line)
                if (r && r.length > 1 && r[1] != null && r[2] != null) {
                    const col = r[1].length + 1
                    const resLen = r[2].length
                    const name = trimOkurigana(r[2].trim())
                    let yomi = ''
                    let desc = ''
                    if (r.length > 4 && r[4] != null) {
                        let memo = r[4].trim()
                        if (memo.startsWith('// @')) {
                            memo = memo.slice(4)
                        }
                        let a = memo.split('// @', 2)
                        if (a.length >= 2) {
                            desc = a[0].trim()
                            yomi = a[1].trim()
                        } else {
                            desc = memo
                        }
                    }
                    info = {
                        name,
                        desc,
                        yomi,
                        type: '',
                        josi: null,
                        pure: true,
                        asyncFn: false,
                        isVariableJosi: false,
                        args: [],
                        range: new Nako3Range(i, col, i, col + resLen, col + resLen)
                    }
                    continue
                }
                // 定義-type行
                r = /^\s*'?type'?\s*:\s*'([^']+)'\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.type = r[1].trim()
                    continue
                }
                // 定義-josi行
                r = /^\s*'?josi'?\s*:\s*(.+),$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    try {
                        info.josi = JSON.parse(r[1].trim().replaceAll("'", '"'))
                    } catch (err) {
                        log.error(`cause error in parse josi`)
                        log.error(err)
                    }
                    continue
                }
                // 定義-pure行
                r = /^\s*'?pure'?\s*:\s*(true|false)\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.pure = r[1].trim() === 'true'
                    continue
                }
                // 定義-isVariableJosi
                r = /^\s*'?isVariableJosi'?\s*:\s*(true|false)\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.isVariableJosi = r[1].trim() === 'true'
                    continue
                }
                // 定義-asyncFn行
                r = /^\s*'?asyncFn'?\s*:\s*(true|false)\s*,$/.exec(line)
                if (r && r.length > 1 && r[1] != null) {
                    info.asyncFn = r[1].trim() === 'true'
                    continue
                }
                // 定義-fn行
                r = /^\s*'?fn'?\s*:\s*(async function|function)\s*(\(.*\).*)$/.exec(line)
                if (r && r.length > 2 && r[2] != null) {
                    let args: FunctionArg[] = []
                    let argparam = r[2].trim()
                    if (argparam.indexOf('//') > -1) {
                        argparam = argparam.split('//')[0]
                    }
                    r = /^[^\(]*\((.*)\)[^\)]*$/.exec(argparam)
                    if (r && r.length > 1 && r[1] != null) {
                        argparam = r[1].trim()
                        r = /^(\s*sys|(.*),\s*sys)\s*(:\s*NakoSystem)?\s*$/.exec(argparam)
                        if (r && r.length > 2 && r[2] != null) {
                            argparam = r[2].trim()
                        }
                        let params = argparam.split(',')
                        for (let j = 0; j < params.length; j++) {
                            let param = params[j].trim()
                            if (param.indexOf(':') >= 0) {
                                param = param.split(':',2)[0].trim()
                            }
                            param = param.toUpperCase()
                            args.push({
                                varname: param,
                                josi: info.josi[j],
                                attr: [],
                                range: null
                            })
                        }
                        info.args = args
                        if (['初期化', '!クリア'].includes(info.name)) {
                            continue
                        }
                        const func: GlobalFunction = {
                            name: info.name,
                            nameNormalized: info.name,
                            modName: '',
                            type: 'func',
                            isPure: info.pure,
                            isMumei: false,
                            isAsync: info.asyncFn,
                            isExport: true,
                            isPrivate: false,
                            isVariableJosi: info.isVariableJosi,
                            hint: info.desc + ( info.asyncFn ? '(非同期関数)' : '' ) + ( info.isVariableJosi ? '(可変引数)' : '' ),
                            args,
                            range: info.range,
                            scopeId: null,
                            origin: 'plugin',
                            activeDeclare: true,
                            ...opts
                        }
                        commandEntry.set(info.name, func)
                    } else {
                        log.info(`no () in fn line:${line}`)
                    }
                    continue
                }
            }
        } catch (err) {
            log.error(err)
            return null
        }
        return plugin
    }
}