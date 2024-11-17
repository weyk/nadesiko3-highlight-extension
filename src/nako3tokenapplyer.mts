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
            let type = token.type
            let nextTokenToFuncPointer = false
            if (type === 'word') {
                const v = token.value
                const tv = trimOkurigana(v)
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing && thing.type === 'func') {
                    (token as TokenCallFunc).meta = thing as GlobalFunction
                    if (nextTokenToFuncPointer) {
                        (token as TokenCallFunc).isFuncPointer = true
                    }
                    type = 'user_func'
                    token.type = type
                }
                if (type === 'word') {
                    for (const [ , things ] of this.moduleEnv.externalThings) {
                        const thing = things.get(tv)
                        if (thing && thing.type === 'func' && thing.isExport) {
                            (token as TokenCallFunc).meta = thing as GlobalFunction
                            if (nextTokenToFuncPointer) {
                                (token as TokenCallFunc).isFuncPointer = true
                            }
                            type = 'user_func'
                            token.type = type
                            break
                        }
                    }
                    if (type === 'word') {
                        const rtype = reservedWords.get(v) || reservedWords.get(tv)
                        if (rtype) {
                            type = rtype
                            token.type = type
                            token.group = reservedGroup.get(type)!
                        }
                        if (token.value === 'そう') {
                            token.value = 'それ'
                        }
                        if (type === 'word') {
                            const commandInfo = nako3plugin.getCommandInfo(v, this.moduleEnv.pluginNames, this.moduleEnv.nakoRuntime)
                            if (commandInfo) {
                                if (commandInfo.type === 'func') {
                                    (token as TokenCallFunc).meta = commandInfo as GlobalFunction
                                    if (nextTokenToFuncPointer) {
                                        (token as TokenCallFunc).isFuncPointer = true
                                    }
                                    type = 'sys_func'
                                }
                                token.type = type
                            }
                            if (type === 'word') {
                                
                            }
                        }
                    }
                }
            }
            nextTokenToFuncPointer = false
            if (type === 'func_ptr' && token.value === '{関数}') {
                nextTokenToFuncPointer = true
            }
        }
    }

    applyVarConst(tokens: Token[], scopeIdList: ScopeIdRange[]) {
        this.errorInfos.clear()
        let i = 0
        for (const token of tokens) {
            let type = token.type
            if (type === 'word') {
                const v = token.value
                const tv = trimOkurigana(v)
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing) {
                    switch (thing.type) {
                    case 'var':
                        type = 'user_var'
                        break
                    case 'const':
                        type = 'user_const'
                        break
                    }
                    token.type = type;
                    (token as TokenRefVar).meta = thing as GlobalVariable
                }
                if (type === 'word') {
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
                                token.type = type;
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
                                token.type = type;
                                (token as TokenRefVar).meta = thing as LocalVariable
                            }
                        } else {
                            //console.log(`miss name:${scopeId}-${tv}`)
                        }
                    } else {
                        //console.log(`miss scopeId:${scopeId}`)
                    }
                }
                if (type === 'word') {
                    for (const [ , things ] of this.moduleEnv.externalThings) {
                        const thing = things.get(tv)
                        if (thing) {
                            switch (thing.type) {
                            case 'var':
                                type = 'user_var'
                                break
                            case 'const':
                                type = 'user_const'
                                break
                            }
                            token.type = type
                            break
                        }
                    }
                    if (type === 'word') {
                        const commandInfo = nako3plugin.getCommandInfo(v, this.moduleEnv.pluginNames, this.moduleEnv.nakoRuntime)
                        if (commandInfo) {
                            if (commandInfo.type === 'var') {
                                (token as TokenRefVar).meta = commandInfo as GlobalVariable
                                type = 'sys_var'
                            } else if (commandInfo.type === 'const') {
                                (token as TokenRefVar).meta = commandInfo as GlobalConstant
                                type = 'sys_const'
                            }
                            token.type = type
                        }
                        if (type === 'word') {
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
                                (token as TokenRefVar).meta = declareSore as GlobalVariable
                                type = 'sys_var'
                                token.type = type
                            }
                            if (type === 'word') {
                                this.errorInfos.addFromToken('ERROR', 'unknwonWord', { value: token.value }, token)
                            }
                        }
                    }
                }
            }
            i++
        }
    }
}
