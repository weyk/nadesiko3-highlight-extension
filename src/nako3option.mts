import {
    ConfigurationChangeEvent,
    WorkspaceConfiguration,
    workspace
} from 'vscode'
import { nadesiko3 } from './nako3nadesiko3.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime} from './nako3types.mjs'

class Nako3ExtensionOption {
    useShebang: boolean
    enablePluginFromRemote: boolean
    enableNako3FromRemote: boolean
    useLazyColorPresent: boolean
    lazyColorRegexps: RegExp[]
    defaultNakoRuntime: NakoRuntime
    useOperatorHint: boolean
    problemsLimit: number
    // for execute wnako setting
    enableCSP: boolean
    enableNonceForScript: boolean
    useCanvas: boolean
    canvasW: number
    canvasH: number
    canvasId: string
    autoDrawStart: boolean
    autoTurtleStart: boolean

    constructor () {
        this.useLazyColorPresent = true
        this.lazyColorRegexps = []
        this.enablePluginFromRemote = true
        this.enableNako3FromRemote = true
        this.useOperatorHint = true
        this.defaultNakoRuntime = ''
        this.useShebang = true
        this.problemsLimit = 100
        this.enableCSP = true
        this.enableNonceForScript = true
        this.useCanvas = true
        this.canvasW = 640
        this.canvasH = 400
        this.canvasId = 'turtle_cv'
        this.autoDrawStart = true
        this.autoTurtleStart = true
    }

    loadAll (conf: WorkspaceConfiguration) {
        this.loadLogTrace(conf)
        this.loadProbremsLimit(conf)
        this.loadNakoRuntime(conf)
        this.loadUseShebang(conf)
        this.loadUseOperatorHint(conf)
        this.loadUseLazyColorPresent(conf)
        this.loadEnablePluginFromRemote(conf)
        this.loadEnableNako3FromRemote(conf)
        this.loadNako3Folder(conf)
        this.loadEnableCSP(conf)
        this.loadEnableNonce(conf)
        this.loadUseCanvas(conf)
        this.loadCanvasId(conf)
        this.loadCanvasW(conf)
        this.loadCanvasH(conf)
        this.loadAutoDrawStart(conf)
        this.loadAutoTurtleStart(conf)
    }

    loadProbremsLimit (conf: WorkspaceConfiguration) {
        const v = conf.get('maxNumberOfProblems')
        if (typeof v === 'number') {
            this.problemsLimit = v
        } else {
            this.problemsLimit = 100
        }
    }

    loadNakoRuntime (conf: WorkspaceConfiguration) {
        let runtime = conf.get('runtimeMode')
        if (typeof runtime === 'string') {
            if (runtime === 'wnako3') {
                runtime = 'wnako'
            } else if (runtime === 'cnako3') {
                runtime = 'cnako'
            }
            if (runtime === 'wnako' || runtime === 'cnako' || runtime === 'snako' || runtime === '') {
                this.defaultNakoRuntime = runtime
            } else {
                this.defaultNakoRuntime = 'wnako'
            }
        } else {
            this.defaultNakoRuntime = 'wnako'
        }
    }

    loadUseShebang (conf: WorkspaceConfiguration) {
        const v = conf.get('runtimeUseShebang')
        if (typeof v === 'boolean') {
            this.useShebang = v
        } else {
            this.useShebang = true
        }
    }

    loadUseOperatorHint (conf: WorkspaceConfiguration) {
        const v = conf.get('useOperatorHint')
        if (typeof v === 'boolean') {
            this.useOperatorHint = v
        } else {
            this.useOperatorHint = true
        }
    }

    loadUseLazyColorPresent (conf: WorkspaceConfiguration) {
        const v = conf.get('useLazyColorPresent')
        if (typeof v === 'boolean') {
            this.useLazyColorPresent = v
        } else {
            this.useLazyColorPresent = true
        }
    }

    loadEnablePluginFromRemote (conf: WorkspaceConfiguration) {
        const v = conf.get('enablePluginFromRemote')
        if (typeof v === 'boolean') {
            this.enablePluginFromRemote = v
        } else {
            this.enablePluginFromRemote = true
        }
    }

    loadEnableNako3FromRemote (conf: WorkspaceConfiguration) {
        const v = conf.get('enableNako3FromRemote')
        if (typeof v === 'boolean') {
            this.enableNako3FromRemote = v
        } else {
            this.enableNako3FromRemote = true
        }
    }

    loadNako3Folder (conf: WorkspaceConfiguration) {
        const v = conf.get('nadesiko3.folder')
        if (typeof v === 'string') {
            nadesiko3.setNadesiko3Folder(v)
        } else {
            nadesiko3.setNadesiko3Folder('')
        }
    }

    loadEnableCSP (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.csp.enable')
        if (typeof v === 'boolean') {
            this.enableCSP = v
        } else {
            this.enableCSP = true
        }
    }

    loadEnableNonce (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.csp.useNonce')
        if (typeof v === 'boolean') {
            this.enableNonceForScript = v
        } else {
            this.enableNonceForScript = true
        }
    }

    loadUseCanvas (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.canvas.use')
        if (typeof v === 'boolean') {
            this.useCanvas = v
        } else {
            this.useCanvas = true
        }
    }

    loadCanvasId (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.canvas.id')
        if (typeof v === 'string') {
            this.canvasId = v
        } else {
            this.canvasId = 'turtle_cv'
        }
    }

    loadCanvasW (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.canvas.size.width')
        if (typeof v === 'number') {
            this.canvasW = v
        } else {
            this.canvasW = 640
        }
    }

    loadCanvasH (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.canvas.size.height')
        if (typeof v === 'number') {
            this.canvasH = v
        } else {
            this.canvasH = 480
        }
    }

    loadAutoDrawStart (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.autoDrawStart')
        if (typeof v === 'boolean') {
            this.autoDrawStart = v
        } else {
            this.autoDrawStart = true
        }
    }

    loadAutoTurtleStart (conf: WorkspaceConfiguration) {
        const v = conf.get('wnako.autoTurtleStart')
        if (typeof v === 'boolean') {
            this.autoTurtleStart = v
        } else {
            this.autoTurtleStart = true
        }
    }

    loadLogTrace (conf: WorkspaceConfiguration) {
        const traceLevel = conf.get('trace')
        logger.info(`activate :workspace.trace:${traceLevel}`)
        if (typeof traceLevel === 'string') {
            let level:string
            if (traceLevel === 'all') {
                level = 'LOG'
            } else if (traceLevel === 'debug') {
                level = 'DEBUG'
            } else if (traceLevel === 'verbose') {
                level = 'INFO'
            } else if (traceLevel === 'messages') {
                level = 'ERROR'
            } else if (traceLevel === 'off') {
                level = 'NONE'
            } else {
                console.log(`trace level invalid(${traceLevel})`)
                level = 'NONE'
            }
            logger.setLevel(level)
        }
    }
}

export const nako3extensionOption = new Nako3ExtensionOption()

export function configurationInitialize () {
    const conf = workspace.getConfiguration('nadesiko3Highlight')

    nako3extensionOption.loadAll(conf)
}

export function configurationChanged (e: ConfigurationChangeEvent) {
    if (e.affectsConfiguration('nadesiko3Highlight.maxNumberOfProblems')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadProbremsLimit(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.useLazyColorPresent')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadUseLazyColorPresent(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.enablePluginFromRemote')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadEnablePluginFromRemote(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.enableNako3FromRemote')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadEnableNako3FromRemote(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.useOperatorHint')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadUseOperatorHint(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeMode')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadNakoRuntime(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.runtimeUseShebang')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadUseShebang(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.nadesiko3.folder')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadNako3Folder(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.csp.enable')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadEnableCSP(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.csp.useNonce')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadEnableNonce(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.canvas.use')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadUseCanvas(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.canvas.id')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadCanvasId(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.canvas.size.width')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadCanvasW(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.canvas.size.height')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadCanvasH(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.autoDrawStart')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadAutoDrawStart(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.wnako.autoTurtleStart')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadAutoTurtleStart(conf)
    } else if (e.affectsConfiguration('nadesiko3Highlight.trace')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadLogTrace(conf)
    }
}
