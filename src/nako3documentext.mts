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

export class Nako3DocumentExt {
    nako3doc: Nako3Document
    validTokens: boolean
    uri: Uri
    errorInfos: ErrorInfoManager
    link: ModuleLink
    isTextDocument: boolean
    isDirty: boolean
    cache: any

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
        this.validTokens = false
        this.cache = {}
        this.errorInfos = new ErrorInfoManager()
        this.isDirty = false

    }

    rename (newFilename: string):void {
        this.nako3doc.filename = newFilename
    }

    setProblemsLimit (limit: number) {
        this.errorInfos.problemsLimit = limit
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
                    if (changed) {
                        this.validTokens = false
                    }
                    return changed
                } else {
                    this.validTokens = false
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
                    if (changed) {
                        this.validTokens = false
                    }
                    return changed
                } else {
                    this.validTokens = false
                    return false
                }
            }
        } else {
            const changed = this.nako3doc.updateText(document.getText(), document.version)
            if (changed) {
                this.validTokens = false
            }
            return changed
        }
    }

    async tokenize (canceltoken?: CancellationToken): Promise<void> {
        if (!this.validTokens) {
            logger.debug(`process tokenize:start:${this.uri.toString()}`)
            await this.nako3doc.tokenize(canceltoken)
            this.validTokens = true
            logger.debug(`process tokenize:end  :${this.uri.toString()}`)
        } else {
            logger.debug(`skip tokenize:      ${this.uri.toString()}`)
        }
    }

}
