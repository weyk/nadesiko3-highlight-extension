import { workspace, Uri, WorkspaceFolder, window, Terminal } from 'vscode'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { showMessage } from './nako3message.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime } from './nako3types.mjs'

export interface TerminalExt extends Terminal {
    filePath?: string
    terminalIndex?: number
}

class Nako3Nadesiko3 extends EventEmitter {
    private confFolder: string
    private extensionFolder: string
    private workspaceFolders: WorkspaceFolder[]
    private home: string
    fromHome: 'env'|'workspace'|'conf'|'extension'|''
    terminals: TerminalExt[]
    private isDirty: boolean
    protected log = logger.fromKey('/Nako3Nadesiko3')

    constructor () {
        super()
        this.confFolder = ''
        this.extensionFolder = ''
        this.home = ''
        this.fromHome = ''
        this.workspaceFolders = []
        this.terminals = []
        this.isDirty = false
    }

    setNadesiko3Folder (folder: string):void {
        this.confFolder = folder
        this.isDirty = true
    }

    setExtensionFolder (folder: string):void {
        this.extensionFolder = folder
        this.isDirty = true
    }

    setWorkspaceFolders (workspaceFolders: readonly WorkspaceFolder[]|undefined):void {
        this.workspaceFolders = []
        if (typeof workspaceFolders !== 'undefined') {
            for (const folder of workspaceFolders) {
                this.workspaceFolders.push(folder)
            }
        }
        this.isDirty = true
    }
 
    addWorkspaceFolders (workspaceFolders: readonly WorkspaceFolder[]|undefined):void {
        if (typeof workspaceFolders !== 'undefined') {
            for (const folder of workspaceFolders) {
                this.workspaceFolders.push(folder)
            }
        }
        this.isDirty = true
    }
 
    removeWorkspaceFolders (workspaceFolders: readonly WorkspaceFolder[]|undefined):void {
        if (typeof workspaceFolders !== 'undefined') {
            for (const folder of workspaceFolders) {
                const index = this.workspaceFolders.findIndex(f => f.name === folder.name)
                if (index >= 0) {
                    this.workspaceFolders.splice(index)
                }
            }
        }
        this.isDirty = true
    }
 
    async refreshNako3Home():Promise<void> {
        // use from NAKO_HOME
        if (process.env.NAKO_HOME) {
            const folder = process.env.NAKO_HOME
            if (await this.isNadesiko3Home(folder)) {
                this.home = folder
                this.fromHome = 'env'
                return
            }
        }
        // use from workspace folder if exists
        for (const wsfolder of this.workspaceFolders) {
            const folder = path.resolve(wsfolder.uri.fsPath, path.join('node_modules', 'nadesiko3'))
            if (await this.isNadesiko3Home(folder)) {
                this.home = folder
                this.fromHome = 'workspace'
            }
        }
        // use from nadesiko3.folder configuration
        if (this.confFolder && this.confFolder !== '') {
            const folder = this.confFolder
            if (await this.isNadesiko3Home(folder)) {
                this.home = folder
                this.fromHome = 'conf'
            }
        }
        // use from nadesiko3.folder configuration
        if (this.extensionFolder && this.extensionFolder !== '') {
            const folder =path.resolve(this.extensionFolder, path.join('node_modules', 'nadesiko3'))
            if (await this.isNadesiko3Home(folder)) {
                this.home = folder
                this.fromHome = 'extension'
            }
        }
        this.isDirty = false
    }

    async getNako3Home(): Promise<string> {
        if (this.isDirty) {
            await this.refreshNako3Home()
        }
        return this.home
    }

    async execForFile(uri: Uri, nakoRuntime: NakoRuntime):Promise<void> {
        const log = this.log.appendKey('.execForFile')
        const startTime = new Date()
        const configNode = workspace.getConfiguration('nadesiko3Highlight.node')
        let nako3folder:string = await this.getNako3Home()
        if (nako3folder === '') {
            showMessage('WARN', 'unknwonNadesiko3home', {})
            return
        }
        log.debug(`command:nadesiko3.exec:nako3folder=${nako3folder}`)
        const fileName = uri.fsPath
        const dirName = path.dirname(fileName)
        let nodeBin = configNode.nodeBin
        if (nodeBin === null || nodeBin === undefined || nodeBin === '') {
            nodeBin = 'node'
        } 
        log.debug(`command:nadesiko3.exec:nodeBin=${nodeBin}`)
        const cnako3 = path.resolve(nako3folder, path.join('src', 'cnako3.mjs'))
        const snako = path.resolve(nako3folder, path.join('core', 'command', 'snako.mjs'))
        const nako3exec = nakoRuntime === 'snako' ? snako : cnako3
        if (!dirName || dirName === '' || dirName === '.') {
            showMessage('WARN', 'unknwonCWD', {})
          return
        }
        const terminal = window.createTerminal(`nadesiko3 (${startTime.toLocaleTimeString()})`)
        terminal.show()
        terminal.sendText(`cd "${dirName}"`)
        terminal.sendText(`${nodeBin} "${nako3exec}" "${path.basename(fileName)}"`)
    }

    public async execForText(text: string, uri: Uri, nakoRuntime: NakoRuntime):Promise<void> {
        const log = this.log.appendKey('.execForText')
        const startTime = new Date()
        const configNode = workspace.getConfiguration('nadesiko3Highlight.node')
        let nako3folder:string = await this.getNako3Home()
        if (nako3folder === '') {
            showMessage('WARN', 'unknwonNadesiko3home', {})
            return
        }
        log.debug(`command:nadesiko3.exec:nako3folder=${nako3folder}`)
        const fileName = uri.fsPath
        const dirName = path.dirname(uri.fsPath)
        const extName = path.extname(fileName) || '.nako3'
        let nodeBin = configNode.nodeBin
        if (nodeBin === null || nodeBin === undefined || nodeBin === '') {
            nodeBin = 'node'
        } 
        log.debug(`command:nadesiko3.exec:nodeBin=${nodeBin}`)
        const cnako3 = path.resolve(nako3folder, path.join('src', 'cnako3.mjs'))
        const snako = path.resolve(nako3folder, path.join('core', 'command', 'snako.mjs'))
        const nako3exec = nakoRuntime === 'snako' ? snako : cnako3
        if (!dirName || dirName === '' || dirName === '.') {
            showMessage('WARN', 'unknwonCWD', {})
          return
        }
        // set tempfile
        const tmpFile = path.join(dirName, `node_${require('crypto').createHash('sha1').update(Math.random().toString()).digest('hex').substr(0, 13)}.tmp${extName}`)
        // wirte code in temp file and exec the file with node
        await fs.writeFile(tmpFile, text)
        const terminal:TerminalExt = window.createTerminal(`nadesiko3 (${startTime.toLocaleTimeString()})`)
        terminal.terminalIndex = this.terminals.length
        terminal.filePath = tmpFile
        this.terminals.push(terminal)
        terminal.show()
        terminal.sendText(`cd "${dirName}"`)
        terminal.sendText(`${nodeBin} "${nako3exec}" "${path.basename(tmpFile)}"`)
        terminal.sendText(`rm "${tmpFile}"`)
    }

    async isNadesiko3Home (folderpath: string|null): Promise<boolean> {
        if (folderpath === null || folderpath === undefined || folderpath === '') {
            return false
        }
        const cnako = path.join(folderpath, 'bin', 'cnako3')
        try {
            let f = await fs.lstat(cnako)
            if (!f.isFile) {
                return false
            }
        } catch (ex) {
            return false
        }
        const cnakomjs = path.join(folderpath, 'src', 'cnako3.mjs')
        try {
            let f = await fs.lstat(cnakomjs)
            if (!f.isFile) {
                return false
            }
        } catch (ex) {
            return false
        }
        return true
    }

    async terminalClose (e:Terminal) {
        const terminal: TerminalExt = e
        if (terminal.filePath) {
            // if tmp file still exist, try to delete it
            try {
                fs.unlink(terminal.filePath)
            } catch (err) {
                if (err instanceof Error && e.name !== 'noent?') {
                    showMessage('WARN', ``, { error: e.name, file: terminal.filePath })
                }
                this.terminals.splice(terminal.terminalIndex!, 1)
            }
        }        
    }

    public async getWnako3Path(): Promise<string|null> {
        const nako3release = await this.getReleaseFolder()
        if (!nako3release) { return null }
        const wnako3 = path.resolve(nako3release, path.join('wnako3.js'))
        return wnako3
    }

    public async getReleaseFolder(): Promise<string|null> {
        const log = this.log.appendKey('.getReleaseFolder')
        let nako3folder:string = await this.getNako3Home()
        if (nako3folder === '') {
            showMessage('WARN', 'unknwonNadesiko3home', {})
            return null
        }
        log.debug(`command:nadesiko3.exec:nako3folder=${nako3folder}`)
        const nako3release = path.resolve(nako3folder, path.join('release'))
        return nako3release
    }
}

export const nadesiko3 = new Nako3Nadesiko3()
