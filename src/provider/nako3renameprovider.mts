import {
    CancellationToken,
    Location,
    Position,
    Range,
    RenameProvider,
    TextDocument,
    WorkspaceEdit,
    workspace
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { trimOkurigana, getScopeId } from '../nako3util.mjs'
import { getMessageWithArgs } from '../nako3message.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3plugin } from '../nako3plugin.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { DeclareThing, GlobalFunction, GlobalVariable, GlobalVarConst, LocalVarConst } from '../nako3types.mjs'
import type { Token, TokenCallFunc, TokenDefFunc, TokenRefVar, Nako3TokenTypePlugin, Nako3TokenTypeApply } from '../nako3token.mjs'

interface PrepareRenameResult {
    range: Range
    placeholder: string
}
export class Nako3RenameProvider implements RenameProvider {
    protected log = logger.fromKey('/provider/Nako3RenameProvider')

    async prepareRename(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<null | PrepareRenameResult> {
        const log = this.log.appendKey('.prepareRename')
        log.info(`■ RenameProvider: prepareRename`)
        let result: PrepareRenameResult |string = "Disallow rename"
        if (canceltoken.isCancellationRequested) {
            log.debug(`prepareRename: canceled begining`)
            return null
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            log.info('prepareRename: before updateText')
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`prepareRename: canceled after updateText`)
                return null
            }
            log.info('prepareRename: before tokenize')
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`prepareRename: canceled after tokenize`)
                return null
            }
            log.info('prepareRename: before getPrepareRename')
            result = await this.getPrepareRename(position, nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`prepareRename: canceled after getPrepareRename`)
                return null
            }
        } else {
            throw getMessageWithArgs('cannnotRenameThis', {})            
        }
        log.info(`prepareRename: end(${typeof result === 'string' ? result : 'accept'})`)
        if (typeof result === 'string') {
            throw result
        }
		return result
    }

    async provideRenameEdits(document: TextDocument, position: Position, newName: string, canceltoken: CancellationToken): Promise<null | WorkspaceEdit> {
        const log = this.log.appendKey('.provideRenameEdits')
        log.info(`■ RenameProvider: provideRenameEdits`)
        let result: WorkspaceEdit|null
        if (canceltoken.isCancellationRequested) {
            log.debug(`provideRenameEdits: canceled begining`)
            return null
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            log.info('provideRenameEdits: before updateText')
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideRenameEdits: canceled after updateText`)
                return null
            }
            log.info('provideRenameEdits: before tokenize')
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideRenameEdits: canceled after tokenize`)
                return null
            }
            log.info('provideRenameEdits: before getPrepareRename')
            result = await this.renameRefs(position, newName, nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                log.debug(`provideRenameEdits: canceled after getPrepareRename`)
                return null
            }
        } else {
            throw getMessageWithArgs('cannnotRenameThis', {})            
        }
        log.info(`prepareRename: end(${typeof result === 'string' ? result : 'accept'})`)
        if (typeof result === 'string') {
            throw result
        }
		return result
    }

    private async renameRefs(position: Position, newName: string, doc: Nako3DocumentExt, canceltoken: CancellationToken): Promise<WorkspaceEdit|null> {
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
 
        if (!token) {
            return null
        }

        let workspaceEdit:WorkspaceEdit|null
        if (['user_func', 'user_var', 'user_const','FUNCTION_NAME', 'FUNCTION_ARG_PARAMETER'].includes(token.type)) {
            const meta = (token as TokenCallFunc).meta
            if (meta.origin === 'global') {
                workspaceEdit = await this.enumlateRenameGlobalVar((token as TokenRefVar).meta as GlobalVarConst, newName, canceltoken)
            } else if (meta.origin === 'local') {
                workspaceEdit = this.enumlateRenameLocalVar(doc, (token as TokenRefVar).meta as LocalVarConst, newName, canceltoken)
            } else {
                return null
            }
        } else {
            return null
        }
        return workspaceEdit
    }

    private async getPrepareRename(position: Position, doc: Nako3DocumentExt, canceltoken: CancellationToken): Promise<PrepareRenameResult|string> {
        const line = position.line
        const col = position.character
        const token = doc.nako3doc.getTokenByPosition(line, col)
        
        if (token !== null) {
            if (['sys_func','sys_var','sys_const'].includes(token.type)) {
                return getMessageWithArgs('cannnotRenameInPluginEntry', { name: token.value })
            } else if (['user_func', 'user_var', 'user_const', 'FUNCTION_NAME', 'FUNCTION_ARG_PARAMETER', ].includes(token.type)) {
                let isRemote = false
                if (token.type === 'user_func') {
                    const meta = (token as TokenCallFunc).meta
                    isRemote = meta.isRemote
                } else if (token.type === 'user_var' || token.type === 'user_const') {
                    const meta = (token as TokenRefVar).meta
                    if (meta.origin === 'global') {
                        isRemote = (meta as DeclareThing).isRemote
                    }
                }
                if (isRemote) {
                    return getMessageWithArgs('cannnotRenameInRemoteEntry', { name: token.value })
                }
                const result: PrepareRenameResult = {
                    range: this.getRangeFromTokenContent(token),
                    placeholder: token.value
                }
                return result
            } else {
                return getMessageWithArgs('cannnotRenameThis', {})
            }
        }
        return 'Disallow rename'
    }

    private getRangeFromTokenContent (token: Token|Nako3Range): Range {
        let range:Range
        if (!(token instanceof Nako3Range) && (token.josi !== '' && typeof token.josiStartCol === 'number')) {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.josiStartCol)
            range = new Range(startPos, endPos)
        } else if (typeof token.resEndCol === 'number') {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.resEndCol)
            range = new Range(startPos, endPos)
        } else {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.endCol)
            range = new Range(startPos, endPos)
        }
        return range
    }

    private async enumlateRenameGlobalVar (thing:DeclareThing, newName: string, canceltoken: CancellationToken): Promise<WorkspaceEdit|null> {
        const log = this.log.appendKey('.enumlateRenameGlobalVar')
        const workspaceEdit = new WorkspaceEdit()
        log.info(`enumlateRenameGlobalVar: call   findFiles`)
        const uris = await workspace.findFiles('**/*.nako3','**/node_modules/**', undefined, canceltoken)
        log.info(`enumlateRenameGlobalVar: return findFiles(${uris.length})`)
        if (!thing.uri) {
            return null
        }
        const uristr = thing.uri.toString()
        const type: Nako3TokenTypePlugin|Nako3TokenTypeApply = thing.type === 'var' ? 'user_var' : thing.type === 'const' ? 'user_const'  : 'user_func'
        for (const uri of uris) {
            log.info(`enumlateRenameGlobalVar: file "${uri.toString()}"`)
            if (canceltoken.isCancellationRequested) {
                return null
            }
            let doc: Nako3DocumentExt|undefined = nako3docs.get(uri)
            let requireClose = false
            if (!doc) {
                doc = nako3docs.openFromFile(uri)
                requireClose = true
                if (canceltoken.isCancellationRequested) {
                    return null
                }
            }
            try {
                if (!doc.isTextDocument) {
                    await doc.updateText(uri)
                    if (canceltoken.isCancellationRequested) {
                        return null
                    }
                }
                await nako3docs.analyze(doc, canceltoken)
                if (canceltoken.isCancellationRequested) {
                    return null
                }

                // user-global-var/const
                for (const token of doc.nako3doc.tokens) {
                    if (thing.type === 'func' && (token.type === 'user_func' || token.type === 'FUNCTION_NAME')) {
                        const vars =  token as TokenCallFunc
                        const meta = vars.meta as GlobalFunction
                        if (meta.uri && !meta.isMumei) {
                            if (meta.nameNormalized === thing.nameNormalized && meta.uri.toString() === uristr) {
                                workspaceEdit.replace(doc.uri, this.getRangeFromTokenContent(token), newName)
                            }
                        }
                    } else if (token.type === type) {
                        const vars =  token as TokenRefVar
                        const meta = vars.meta as GlobalVarConst
                        if (meta.uri) {
                            if (meta.nameNormalized === thing.nameNormalized && meta.uri.toString() === uristr) {
                                workspaceEdit.replace(doc.uri, this.getRangeFromTokenContent(token), newName)
                            }
                        }
                    }
                }
            } catch (err) {
                log.error(`cause error in enumlateRenameGlobalVar`)
                log.error(err)
            } finally {
                if (requireClose) {
                    nako3docs.closeAtFile(uri)
                }
            } 
        }
        return workspaceEdit
    }

    private enumlateRenameLocalVar (doc: Nako3DocumentExt, thing:LocalVarConst, newName: string, canceltoken: CancellationToken): WorkspaceEdit|null {
        const log = this.log.appendKey('.enumlateRenameLocalVar')
        const workspaceEdit = new WorkspaceEdit()
        log.info(`enumlateRenameLocalVar: start`)
        let type: Nako3TokenTypeApply
        type = thing.type === 'const' ? 'user_const' : 'user_var' 
        log.info(`enumlateRenameLocalVar: rename "${thing.name}" of "${type}" in "${thing.scopeId}" to "${newName}"`)
        try {
            // user-global-var/const
            let i = 0
            for (const token of doc.nako3doc.tokens) {
                if (token.type === type) {
                    const vars =  token as TokenRefVar
                    const meta = vars.meta as LocalVarConst
                    if (meta.name === thing.name && meta.scopeId === thing.scopeId) {
                        workspaceEdit.replace(doc.uri, this.getRangeFromTokenContent(token),newName)
                    }
                } else if (thing.type === 'parameter' && token.type === 'FUNCTION_ARG_PARAMETER') {
                    const scopeId = getScopeId(i, doc.nako3doc.moduleEnv.scopeIdList)
                    if (trimOkurigana(token.value) === thing.name && scopeId === thing.scopeId) {
                        workspaceEdit.replace(doc.uri, this.getRangeFromTokenContent(token), newName)
                    }
                }
                if (canceltoken.isCancellationRequested) {
                    return null
                }
                i++
            }
        } catch (err) {
            log.error(`cause error in enumlateRenameLocalVar`)
            log.error(err)
        } 
        return workspaceEdit
    }
}
