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
    useParser: boolean
    enablePluginFromRemote: boolean
    enableNako3FromRemote: boolean
    defaultNakoRuntime: NakoRuntime
    useOperatorHint: boolean
    problemsLimit: number

    constructor () {
        this.useParser = true
        this.enablePluginFromRemote = true
        this.enableNako3FromRemote = true
        this.useOperatorHint = true
        this.defaultNakoRuntime = ''
        this.useShebang = true
        this.problemsLimit = 100
    }

    loadAll (conf: WorkspaceConfiguration) {
        this.loadLogTrace(conf)
        this.loadProbremsLimit(conf)
        this.loadNakoRuntime(conf)
        this.loadUseShebang(conf)
        this.loadUseOperatorHint(conf)
        this.loadUseParser(conf)
        this.loadEnablePluginFromRemote(conf)
        this.loadEnableNako3FromRemote(conf)
        this.loadNako3Folder(conf)
    }

    loadProbremsLimit (conf: WorkspaceConfiguration) {
        const limit = conf.get('maxNumberOfProblems')
        if (typeof limit === 'number') {
            this.problemsLimit = limit
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
        const useShebang = conf.get('runtimeUseShebang')
        if (typeof useShebang === 'boolean') {
            this.useShebang = useShebang
        } else {
            this.useShebang = true
        }
    }

    loadUseOperatorHint (conf: WorkspaceConfiguration) {
        const useOperatorHint = conf.get('useOperatorHint')
        if (typeof useOperatorHint === 'boolean') {
            this.useOperatorHint = useOperatorHint
        } else {
            this.useOperatorHint = true
        }
    }

    loadUseParser (conf: WorkspaceConfiguration) {
        const useParser = conf.get('useParser')
        if (typeof useParser === 'boolean') {
            this.useParser = useParser
        } else {
            this.useParser = true
        }
    }

    loadEnablePluginFromRemote (conf: WorkspaceConfiguration) {
        const enablePluginFromRemote = conf.get('enablePluginFromRemote')
        if (typeof enablePluginFromRemote === 'boolean') {
            this.enablePluginFromRemote = enablePluginFromRemote
        } else {
            this.enablePluginFromRemote = true
        }
    }

    loadEnableNako3FromRemote (conf: WorkspaceConfiguration) {
        const enableNako3FromRemote = conf.get('enableNako3FromRemote')
        if (typeof enableNako3FromRemote === 'boolean') {
            this.enableNako3FromRemote = enableNako3FromRemote
        } else {
            this.enableNako3FromRemote = true
        }
    }

    loadNako3Folder (conf: WorkspaceConfiguration) {
        const nadesiko3folder = conf.get('nadesiko3.folder')
        if (typeof nadesiko3folder === 'string') {
            nadesiko3.setNadesiko3Folder(nadesiko3folder)
        } else {
            nadesiko3.setNadesiko3Folder('')
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
    } else if (e.affectsConfiguration('nadesiko3Highlight.useParser')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadUseParser(conf)
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
    } else if (e.affectsConfiguration('nadesiko3Highlight.trace')) {
        const conf = workspace.getConfiguration('nadesiko3Highlight')
        nako3extensionOption.loadLogTrace(conf)
    }
}
