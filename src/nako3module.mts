import { Uri } from 'vscode'
import { filenameToModName } from './nako3util.mjs'
import type { NakoRuntime, DeclareThings, ExternThings, AllVariables, ScopeIdRange }  from './nako3types.mjs'

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

type ImportInfos = Map<string, ImportInfo>

export class ModuleLink {
    uri: Uri
    filePath: string
    mainFilepath: string
    imports: ImportInfos
    importBy: Set<string>

    constructor (uri: Uri, mainUri?: Uri) {
        this.uri = uri
        this.filePath = uri.toString()
        this.mainFilepath = mainUri?.toString() || uri.toString()
        this.imports = new Map()
        this.importBy = new Set()
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
    externalThings: ExternThings
    allVariables: AllVariables
    pluginNames: string[]
    nakoRuntime: NakoRuntime
    scopeIdList: ScopeIdRange[]

    constructor (filename: string, link: ModuleLink) {
        this.filename = filename
        this.modName = filenameToModName(filename, link)
        this.uri = link.uri
        this.isRemote = false
        this.pluginNames = []
        this.declareThings = new Map()
        this.externalThings = new Map()
        this.allVariables = new Map()
        this.nakoRuntime = ''
        this.scopeIdList = []
    }

    fixAlllVars () {
        const globalThings = this.allVariables.get('global')
        for (const [ scopeId, things ] of this.allVariables) {
            if (scopeId === 'global') {
                continue
            }
            const deleteList:string[] = []
            for (const [ varname, thing ] of things) {
                // 自身の引数と明示的に定義された変数・定数は除外(必ずローカル変数)
                if (thing.type === 'parameter' || thing.activeDeclare) {
                    continue
                }
                // グローバルに同名の変数・定数が存在するならローカルは消す
                if (globalThings?.has(thing.name) || this.declareThings.has(thing.name)) {
                    console.log(`fixAllVars: local throgh global: ${scopeId} - global`)
                    thing.scopeId = 'global'
                    // deleteList.push(varname)
                }
            }
            for (const varname of deleteList) {
                things.delete(varname)
            }
        }
    }
}
  