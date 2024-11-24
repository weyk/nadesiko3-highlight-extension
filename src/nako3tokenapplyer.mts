import { ModuleLink, ModuleEnv, ModuleOption } from './nako3module.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import reservedWords from './nako3/nako_reserved_words.mjs'
import { trimOkurigana, getScopeId } from './nako3util.mjs'
import { reservedGroup } from './nako3lexer_rule.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { logger } from './logger.mjs'
import type { GlobalFunction, GlobalVariable, GlobalConstant, GlobalVarConst,LocalVariable, ScopeIdRange } from './nako3types.mjs'
import type { Token, TokenCallFunc, TokenRefVar } from './nako3token.mjs'

export class Nako3TokenApplyer {
    private moduleEnv: ModuleEnv
    public errorInfos: ErrorInfoManager

    constructor (moduleEnv: ModuleEnv, ) {
        this.moduleEnv = moduleEnv
        this.errorInfos = new ErrorInfoManager()
    }

    public setProblemsLimit (limit: number):void {
        this.errorInfos.setProblemsLimit(limit)
    }

    public applyFunction(tokens: Token[]) {
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
            token.parseType = type
        }
    }

    applyVarConst(tokens: Token[], scopeIdList: ScopeIdRange[]) {
        this.errorInfos.clear()
        let i = 0
        for (const token of tokens) {
            let type = token.parseType
            if (type === 'word') {
                const v = token.value
                const tv = trimOkurigana(v)
                // 自モジュールのグローバルな変数・定数をチェックする
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing) {
                    switch (thing.type) {
                    case 'var':
                        (token as TokenRefVar).meta = thing as GlobalVariable
                        type = 'user_var'
                        break
                    case 'const':
                        (token as TokenRefVar).meta = thing as GlobalConstant
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
                            if (thing.origin === 'system') {
                                switch (thing.type) {
                                case 'var':
                                    type = 'sys_var'
                                    break
                                case 'const':
                                    type = 'sys_const'
                                    break
                                }
                                //console.log(`hit:${scopeId}-${thing.name}-${thing.type}`)
                                (token as TokenRefVar).meta = thing as LocalVariable
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
                                //console.log(`hit:${scopeId}-${thing.name}-${thing.type}`)
                                (token as TokenRefVar).meta = thing as LocalVariable
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
                                switch (thing.type) {
                                case 'var':
                                    (token as TokenRefVar).meta = thing as GlobalVariable
                                    type = 'user_var'
                                    break
                                case 'const':
                                    (token as TokenRefVar).meta = thing as GlobalConstant
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
                                if (commandInfo.type === 'var') {
                                    (token as TokenRefVar).meta = commandInfo as GlobalVariable
                                    type = 'sys_var'
                                } else if (commandInfo.type === 'const') {
                                    (token as TokenRefVar).meta = commandInfo as GlobalConstant
                                    type = 'sys_const'
                                }
                            }
                            if (type === 'word') {
                                // システム内で都特別扱いしている名称の変数・定数をチェックする
                                if (token.value === 'それ') {
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
                                    };
                                    (token as TokenRefVar).meta = declareSore
                                    type = 'sys_var'
                                }
                                if (type === 'word') {
                                    // 全てのチェックを抜けてなおwordならばエラーとする。
                                    // ・Pluginの取り込み漏れによるシステム関数の名前が解決できていない。
                                    // ・打ち間違いによる変数・定数・関数の名称誤り。
                                    this.errorInfos.addFromToken('ERROR', 'unknwonWord', { value: token.value }, token)
                                }
                            }
                        }
                    }
                }
            }
            token.type = type
            i++
        }
    }
}
