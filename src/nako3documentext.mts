import {
    workspace,
    TextDocument,
    Uri,
    CancellationToken
} from 'vscode'
import { Nako3Document } from './nako3document.mjs'
import { ErrorInfoManager } from './nako3errorinfo.mjs'
import { ModuleLink } from './nako3module.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime } from './nako3types.mjs'

export class Nako3DocumentExt {
    public nako3doc: Nako3Document
    public uri: Uri
    public errorInfos: ErrorInfoManager
    link: ModuleLink
    public isTextDocument: boolean
    public isDirty: boolean
    public cache: any
    nakoRuntime: NakoRuntime

    constructor (target: TextDocument|Uri) {
        if (target instanceof Uri) {
            this.uri = target
            this.isTextDocument = false
            
        } else {
            this.uri = target.uri
            this.isTextDocument = true            
        }
        this.link = new ModuleLink(this.uri, this.uri)
        this.nako3doc = new Nako3Document(this.uri.toString(), this.link)
        this.cache = {}
        this.errorInfos = new ErrorInfoManager()
        this.isDirty = false
        this.nakoRuntime = ''
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.setProblemsLimit(limit)
    }

    async updateText (document: Uri|TextDocument, canceltoken?: CancellationToken): Promise<boolean> {
        if (canceltoken && canceltoken.isCancellationRequested) {
            return false
        }
        if (document instanceof Uri) {
            let isRemote = false
            if (document.toString().startsWith('http://') || document.toString().startsWith('https://')) {
                isRemote = true
                const response = await fetch(document.toString())
                if (canceltoken && canceltoken.isCancellationRequested) {
                    return false
                }
                if (response.status === 200) {
                    const text = await response.text()
                    if (canceltoken && canceltoken.isCancellationRequested) {
                        return false
                    }
                    const changed = this.nako3doc.updateText(text.toString(), 0)
                    return changed
                } else {
                    return false
                }
            } else {
                if (workspace) {
                    const stat = await workspace.fs.stat(document)
                    if (canceltoken && canceltoken.isCancellationRequested) {
                        return false
                    }
                    const text = await workspace.fs.readFile(document)
                    if (canceltoken && canceltoken.isCancellationRequested) {
                        return false
                    }
                    const changed = this.nako3doc.updateText(text.toString(), stat.mtime)
                    return changed
                } else {
                    return false
                }
            }
        } else {
            const changed = this.nako3doc.updateText(document.getText(), document.version)
            return changed
        }
    }
}
