import { ModuleLink, ModuleEnv, ModuleOption } from './nako3module.mjs'
import reservedWords from './nako3/nako_reserved_words.mjs'
import { trimOkurigana, getScopeId } from './nako3util.mjs'
import { reservedGroup } from './nako3lexer_rule.mjs'
import { nako3plugin } from './nako3plugin.mjs'
import { logger } from './logger.mjs'
import type { DeclareFunction, DeclareVariable, LocalVariable, ScopeIdRange } from './nako3types.mjs'
import type { Token, TokenCallFunc, TokenRefVar } from './nako3token.mjs'

export class Nako3TokenApplyer {
    moduleOption: ModuleOption
    moduleEnv: ModuleEnv
    link: ModuleLink

    constructor (moduleEnv: ModuleEnv, moduleOption: ModuleOption, link: ModuleLink) {
        this.moduleEnv = moduleEnv
        this.moduleOption = moduleOption
        this.link = link
    }

    applyFunction(tokens: Token[]) {
        for (const token of tokens) {
            let type = token.type
            let nextTokenToFuncPointer = false
            if (type === 'word') {
                const v = token.value
                const tv = trimOkurigana(v)
                const thing = this.moduleEnv.declareThings.get(tv)
                if (thing && thing.type === 'func') {
                    (token as TokenCallFunc).meta = thing as DeclareFunction
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
                            (token as TokenCallFunc).meta = thing as DeclareFunction
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
                                    (token as TokenCallFunc).meta = commandInfo as DeclareFunction
                                    if (nextTokenToFuncPointer) {
                                        (token as TokenCallFunc).isFuncPointer = true
                                    }
                                    type = 'sys_func'
                                }
                                token.type = type
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

    applyVarConst(tokens: Token[], scopeList: ScopeIdRange[]) {
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
                    (token as TokenRefVar).meta = thing as DeclareVariable
                }
                if (type === 'word') {
                    const scopeId = getScopeId(i, scopeList)
                    const vars = this.moduleEnv.allVariables.get(scopeId)
                    if (vars) {
                        const thing = vars.get(tv)
                        if (thing) {
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
                                (token as TokenRefVar).meta = commandInfo as DeclareVariable
                                type = 'sys_var'
                            } else {
                                (token as TokenRefVar).meta = commandInfo as DeclareVariable
                                type = 'sys_const'
                            }
                            token.type = type
                        }
                    }
                }
            }
            i++
        }
    }
}
