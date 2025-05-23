import { Uri } from 'vscode'
import { filenameToModName } from './nako3util.mjs'
import { logger } from './logger.mjs'
import { setSerialId, incSerialId } from './nako3serialid.mjs'
import type { NakoRuntime, DeclareThings, ExternThings as ExternalThings, AllScopeVarConsts, ScopeIdRange }  from './nako3/nako3types.mjs'

export interface ImportInfo {
    importKey: string
    type: 'js'|'nako3'|''
    pluginKey: string
    exists: boolean
    wasErrorReported: boolean
    startLine: number
    startCol: number
    endLine: number
    endCol: number
}

export interface LinkPlugin {
    importKey: string
    type: 'js'
    pluginKey: string
    existFile: boolean
    filepath: string
    contentKey: null|string|number
    hasCommandInfo: boolean
    wasErrorReported: boolean
}

type ImportInfos = Map<string, ImportInfo>
export type LinkPlugins = Map<string, LinkPlugin>

export class ModuleLink {
    uri: Uri
    filePath: string
    mainFilepath: string
    importPlugins: LinkPlugins
    importNako3s: ImportInfos
    importBy: Set<string>

    constructor (uri: Uri, mainUri?: Uri) {
        this.uri = uri
        this.filePath = uri.toString()
        this.mainFilepath = mainUri?.toString() || uri.toString()
        this.importPlugins = new Map()
        this.importNako3s = new Map()
        this.importBy = new Set()
    }

    reset ():void {
        this.filePath = ''
        this.mainFilepath = ''
        this.importPlugins.clear()
        this.importNako3s.clear()
        this.importBy.clear()
    }
}

export class ModuleOption {
    isIndentSemantic: boolean
    isPrivateDefault: boolean
    isExportDefault: boolean
    isDNCL: boolean
    isDNCL2: boolean
    isAsync: boolean // deprecated
    genMode: string
    isStrict: boolean

    constructor () {
        this.isIndentSemantic = false
        this.isPrivateDefault = false
        this.isExportDefault = true
        this.isDNCL = false
        this.isDNCL2 = false
        this.isStrict = false
        this.isAsync = false
        this.genMode = 'sync'
        this.reset()
    }

    reset( ) {
        this.isIndentSemantic = false
        this.isPrivateDefault = false
        this.isExportDefault = true
        this.isDNCL = false
        this.isDNCL2 = false
        this.isStrict = false
        this.isAsync = false
        this.genMode = 'sync'
    }
}
  
export class ModuleEnv {
    filename: string
    modName: string
    uri: Uri
    isRemote: boolean
    declareThings: DeclareThings
    externalThings: ExternalThings
    allScopeVarConsts: AllScopeVarConsts
    pluginNames: string[]
    nakoRuntime: NakoRuntime
    scopeIdList: ScopeIdRange[]
    declareFuncSid: number
    declareAllSid: number

    constructor (filename: string, link: ModuleLink) {
        this.filename = filename
        this.modName = filenameToModName(filename, link)
        this.uri = link.uri
        this.isRemote = false
        this.pluginNames = []
        this.declareThings = new Map()
        this.externalThings = new Map()
        this.allScopeVarConsts = new Map()
        this.nakoRuntime = ''
        this.scopeIdList = []
        this.declareFuncSid = setSerialId()
        this.declareAllSid = setSerialId()
    }

    reset () {
        this.filename = ''
        this.modName = ''
        this.isRemote = false
        this.pluginNames.length = 0
        this.declareThings.clear()
        this.externalThings.clear()
        this.allScopeVarConsts.clear()
        this.nakoRuntime = ''
        this.scopeIdList.length = 0
    }

    updateFuncSid ():void {
        this.declareFuncSid = incSerialId(this.declareFuncSid)
    }

    updateAllSid ():void {
        this.declareAllSid = incSerialId(this.declareAllSid)
    }

    fixAlllVars () {
        const log = logger.fromKey('/ModuleEnv.fixAlllVars')
        const globalThings = this.allScopeVarConsts.get('global')
        for (const [ scopeId, things ] of this.allScopeVarConsts) {
            if (scopeId !== 'global') {
                const deleteList:string[] = []
                for (const [ varname, thing ] of things) {
                    // 自身の引数と明示的に定義された変数・定数は除外(必ずローカル変数)
                    if (thing.type === 'parameter' || thing.activeDeclare) {
                        continue
                    }
                    // グローバルに同名の変数・定数が存在するならローカルは消す
                    if (globalThings?.has(thing.name) || this.declareThings.has(thing.name)) {
                        thing.scopeId = 'global'
                        // deleteList.push(varname)
                    }
                }
                for (const varname of deleteList) {
                    things.delete(varname)
                }
            }
        }
        for (const [ scopeId, things ] of this.allScopeVarConsts) {
            for (const [ varname, thing ] of things) {
                const deleteList:string[] = []
                if (thing.activeDeclare) {
                    continue
                }
                for (const [ uristr, exinfo ] of this.externalThings) {
                    if (uristr === this.uri.toString()) {
                        continue
                    }
                    // グローバルに同名の変数・定数が存在するならローカルは消す
                    const v = exinfo.things.get(thing.name)
                    if (v) {
                        let isExtern = false
                        if (v.activeDeclare) {
                            isExtern = true
                        } else {
                            isExtern = true
                            log.info(`fixAllVars: passive extern ${v.name} from ${uristr}s`)
                        }
                        if (isExtern) {
                            thing.scopeId = 'extern'
                            deleteList.push(varname)
                        }
                    }
                }
                for (const varname of deleteList) {
                    things.delete(varname)
                }
            }
        }
    }
}
  