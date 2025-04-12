import { ModuleLink, ModuleEnv, ModuleOption } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import reservedWords from './nako3/nako_reserved_words.mjs'
import { trimOkurigana, getScopeId } from './nako3util.mjs'
import { reservedGroup } from './nako3lexer_rule.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { logger } from './logger.mjs'
import type { GlobalFunction, GlobalVariable, GlobalConstant, LocalVariable, ScopeIdRange } from './nako3types.mjs'
import type { Token, TokenCallFunc, TokenRefVar, TokenRef } from './nako3token.mjs'

export class Nako3TokenApplyer {
    private moduleEnv: ModuleEnv
    public errorInfos: ErrorInfoManager
    protected log = logger.fromKey('/Nako3TokenApplyer')

    constructor (moduleEnv: ModuleEnv, ) {
        this.moduleEnv = moduleEnv
        this.errorInfos = new ErrorInfoManager()
    }

    reset ():void {
        this.errorInfos.clear()
    }

    public setProblemsLimit (limit: number):void {
        this.errorInfos.setProblemsLimit(limit)
    }

    // この処理はerrorInfosを使用しない。
    public applyFunction(tokens: Token[]):void {                                                                                                                                                                                                                               
        for (const token of tokens) {
            let type = token.fixType
            let nextTokenToFuncPointer = false
            if (type === 'word') {
                const v = token.value
                const tv = trimOkurigana(v)
                // 自モジュールのグローバルな関数をチェックする
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing && thing.type === 'func') {
                    (token as TokenCallFunc).meta = thing as GlobalFunction
                    if (nextTokenToFuncPointer) {
                        (token as TokenCallFunc).isFuncPointer = true
                    }
                    type = 'user_func'
                }
                if (type === 'word') {
                    // 外部モジュールのグローバルな関数をチェックする
                    for (const [ , info ] of this.moduleEnv.externalThings) {
                        const thing = info.things.get(tv)
                        if (thing && thing.type === 'func' && thing.isExport) {
                            (token as TokenCallFunc).meta = thing as GlobalFunction
                            if (nextTokenToFuncPointer) {
                                (token as TokenCallFunc).isFuncPointer = true
                            }
                            type = 'user_func'
                            break
                        }
                    }
                    if (type === 'word') {
                        // 予約語(文法上の構文)と特殊語句の「そう」をチェックする
                        const rtype = reservedWords.get(v) || reservedWords.get(tv)
                        if (rtype) {
                            type = rtype
                            token.group = reservedGroup.get(type)!
                        }
                        if (token.value === 'そう') {
                            token.value = 'それ'
                        }
                        if (type === 'word') {
                            // 取り込んでいるPluginに定義されている命令(関数)をチェックする
                            const commandInfo = nako3plugin.getCommandInfo(v, this.moduleEnv.pluginNames, this.moduleEnv.nakoRuntime)
                            if (commandInfo) {
                                if (commandInfo.type === 'func') {
                                    (token as TokenCallFunc).meta = commandInfo as GlobalFunction
                                    if (nextTokenToFuncPointer) {
                                        (token as TokenCallFunc).isFuncPointer = true
                                    }
                                    type = 'sys_func'
                                }
                            }
                            if (type === 'word') {
                                // この時点では変数はwordのままとなる。
                            }
                        }
                    }
                }
            }
            nextTokenToFuncPointer = false
            if (type === 'func_ptr' && token.value === '{関数}') {
                nextTokenToFuncPointer = true
            }
            token.type = type
            token.funcType = type
            token.parseType = type
        }
    }

    applyVarConst(tokens: Token[], scopeIdList: ScopeIdRange[]):void {
        const log = this.log.appendKey('.applyVarConst')
        this.errorInfos.clear()
        let i = 0
        let unknownWords: string[] = []
        for (const token of tokens) {
            let type = token.parseType
            if (type === 'word') {
                const v = token.value
                const isWrite = (token as TokenRef).isWrite ? true : false
                const tv = trimOkurigana(v)
                // 自モジュールのグローバルな変数・定数をチェックする
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing) {
                    const tokenRefVar = (token as TokenRefVar)
                    switch (thing.type) {
                    case 'var':
                        tokenRefVar.meta = thing as GlobalVariable
                        tokenRefVar.isWrite = isWrite
                        type = 'user_var'
                        break
                    case 'const':
                        tokenRefVar.meta = thing as GlobalConstant
                        tokenRefVar.isWrite = isWrite
                        type = 'user_const'
                        break
                    }
                }
                if (type === 'word') {
                   // 自モジュールのローカルな変数・定数をチェックする
                    const scopeId = getScopeId(i, scopeIdList)
                    const vars = this.moduleEnv.allScopeVarConsts.get(scopeId)
                    if (vars) {
                        const thing = vars.get(tv)
                        if (thing) {
                            const tokenRefVar = (token as TokenRefVar)
                            if (thing.origin === 'system') {
                                switch (thing.type) {
                                case 'var':
                                    type = 'sys_var'
                                    break
                                case 'const':
                                    type = 'sys_const'
                                    break
                                }
                                // console.log(`hit:${scopeId}-${thing.name}-${thing.type}`)
                                tokenRefVar.meta = thing as LocalVariable
                                tokenRefVar.isWrite = isWrite
                            } else {
                                switch (thing.type) {
                                case 'var':
                                    type = 'user_var'                                       
                                    break
                                case 'parameter':
                                    type = 'user_var'
                                    break
                                case 'const':
                                    type = 'user_const'
                                    break
                                }
                                // console.log(`hit:${scopeId}-${thing.name}-${thing.type}:${token.parseType}`)
                                tokenRefVar.meta = thing as LocalVariable
                                tokenRefVar.isWrite = isWrite
                            }
                        } else {
                            //console.log(`miss name:${scopeId}-${tv}`)
                        }
                    } else {
                        //console.log(`miss scopeId:${scopeId}`)
                    }
                    if (type === 'word') {
                        // 外部モジュールのグローバルな変数と定数をチェックする
                        for (const [ , info ] of this.moduleEnv.externalThings) {
                            const thing = info.things.get(tv)
                            if (thing) {
                                const tokenRefVar = (token as TokenRefVar)
                                switch (thing.type) {
                                case 'var':
                                    tokenRefVar.meta = thing as GlobalVariable
                                    tokenRefVar.isWrite = isWrite
                                    type = 'user_var'
                                    break
                                case 'const':
                                    tokenRefVar.meta = thing as GlobalConstant
                                    tokenRefVar.isWrite = isWrite
                                    type = 'user_const'
                                    break
                                }
                                break
                            }
                        }
                        if (type === 'word') {
                            // 取り込んでいるPluginに定義されている変数と定数をチェックする
                            const commandInfo = nako3plugin.getCommandInfo(v, this.moduleEnv.pluginNames, this.moduleEnv.nakoRuntime)
                            if (commandInfo) {
                                const tokenRefVar = (token as TokenRefVar)
                                if (commandInfo.type === 'var') {
                                    tokenRefVar.meta = commandInfo as GlobalVariable
                                    tokenRefVar.isWrite = isWrite
                                    type = 'sys_var'
                                } else if (commandInfo.type === 'const') {
                                    tokenRefVar.meta = commandInfo as GlobalConstant
                                    tokenRefVar.isWrite = isWrite
                                    type = 'sys_const'
                                }
                            }
                            if (type === 'word') {
                                // システム内で都特別扱いしている名称の変数・定数をチェックする
                                if (token.value === 'それ') {
                                    const tokenRefVar = (token as TokenRefVar)
                                    const declareSore: GlobalVariable = {
                                        name: 'それ',
                                        nameNormalized: 'それ',
                                        type: 'var',
                                        modName: '',
                                        isExport: true,
                                        isPrivate: false,
                                        origin: 'system',
                                        range: null,
                                        isRemote: false,
                                        activeDeclare: true
                                    }
                                    tokenRefVar.meta = declareSore
                                    tokenRefVar.isWrite = isWrite
                                    type = 'sys_var'
                                }
                                if (type === 'word') {
                                    // 全てのチェックを抜けてなおwordならばエラーとする。
                                    // ・Pluginの取り込み漏れによるシステム関数の名前が解決できていない。
                                    // ・打ち間違いによる変数・定数・関数の名称誤り。
                                    this.errorInfos.addFromToken('ERROR', 'unknwonWord', { value: token.value }, token)
                                    if (!unknownWords.includes(token.value)) {
                                        unknownWords.push(token.value)
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (type === 'FUNCTION_ARG_PARAMETER') {
                // 自モジュールのローカルな変数・定数をチェックする
                const v = token.value
                const isWrite = (token as TokenRef).isWrite ? true : false
                const tv = trimOkurigana(v)
                const scopeId = getScopeId(i, scopeIdList)
                const vars = this.moduleEnv.allScopeVarConsts.get(scopeId)
                if (vars) {
                    const thing = vars.get(tv)
                    if (thing) {
                        const tokenRefVar = (token as TokenRefVar)
                        if (thing.origin === 'local' && thing.type === 'parameter') {
                            // console.log(`hit:${scopeId}-${thing.name}-${thing.type}:${token.parseType}`)
                            tokenRefVar.meta = thing as LocalVariable
                            tokenRefVar.isWrite = isWrite
                        }
                    }
                }
            }
            token.type = type
            i++
        }
        if (unknownWords.length > 0) {
            log.error(`unknownWord has raised`)
            log.error(`words:${unknownWords.join(',')}`)
            log.error(`moduleEnv.declareThings:`)
            log.error(this.moduleEnv.declareThings)
            log.error(`moduleEnv.allScopeVarConsts:`)
            log.error(this.moduleEnv.allScopeVarConsts)
        }
    }
}
