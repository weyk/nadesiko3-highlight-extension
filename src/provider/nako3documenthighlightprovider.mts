import {
    CancellationToken,
    DocumentHighlight,
    DocumentHighlightKind,
    DocumentHighlightProvider,
    Position,
    Range,
    TextDocument
} from 'vscode'
import { Nako3Document } from '../nako3document.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { Token, TokenRef, TokenLink, LinkMain, LinkRef } from '../nako3token.mjs'

export class Nako3DocumentHighlightProvider implements DocumentHighlightProvider {
    async provideDocumentHighlights(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<DocumentHighlight[]> {
        logger.info(`■ DocumentHighlightProvider: provideDocumentHighlights`)
        let highlight: DocumentHighlight[]|null = []
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideDocumentHighlights: canceled begining`)
            return highlight
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentHighlights: canceled adter updateText`)
                return highlight
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentHighlights: canceled after tokenize`)
                return highlight
            }
            highlight = this.getHighlight(position, nako3doc.nako3doc)
            if (canceltoken.isCancellationRequested) {
                return highlight
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
		return highlight
    }

    getHighlightFromToken(token: Token, kind: DocumentHighlightKind, col?: number): DocumentHighlight|null {
        if (token === null) {
            return null
        }
        let range:Range
        if (token.josi !== '' && typeof token.josiStartCol === 'number') {
            if (col === undefined || col < token.josiStartCol) {
                const startPos = new Position(token.startLine, token.startCol)
                const endPos = new Position(token.endLine, token.josiStartCol)
                range = new Range(startPos, endPos)
            } else {
                const startPos = new Position(token.endLine, token.josiStartCol)
                const endPos = new Position(token.endLine, token.endCol)
                range = new Range(startPos, endPos)
            }
        } else {
            const startPos = new Position(token.startLine, token.startCol)
            const endPos = new Position(token.endLine, token.endCol)
            range = new Range(startPos, endPos)
        }
        return new DocumentHighlight(range, kind)
    }

    getHighlight (position: Position, doc: Nako3Document): DocumentHighlight[] {
        const line = position.line
        const col = position.character
        const token = doc.getTokenByPosition(line, col)
        const highlightList: DocumentHighlight[] = []
        if (!token) { return [] }
        if (['user_var', 'user_const', 'user_func', 'sys_var', 'sys_const', 'sys_func', 'FUNCTION_ARG_PARAMETER'].includes(token.type)) {
            const targetMeta = (token as TokenRef).meta
            const isFunc = ['user_func', 'sys_func'].includes(token.type)
            if (targetMeta) {
                for (const token of doc.tokens) {
                    const tokenRef = (token as TokenRef)
                    const meta = tokenRef.meta
                    const isWrite = tokenRef.isWrite ? true : false
                    if (meta) {
                        let equalRange = false
                        if (meta.range && targetMeta.range ) {
                            equalRange = meta.range.equals(targetMeta.range)
                        } else if (meta.range == null && targetMeta.range == null) {
                            equalRange = true
                        }
                        if (meta.nameNormalized === targetMeta.nameNormalized && equalRange) {
                            let kind = DocumentHighlightKind.Text
                            if (!isFunc) {
                                kind = isWrite ? DocumentHighlightKind.Write : DocumentHighlightKind.Read
                            }
                            const highlight = this.getHighlightFromToken(token, kind)
                            if (highlight) {
                                highlightList.push(highlight)
                            }
                        }
                    }
                }
            } else {
                logger.info(`getHighlight: no havve meta "${token.value}"`)
            }
        } else if ((token as TokenLink).link) {
            let link = (token as TokenLink).link
            if (link && (link as LinkRef).mainTokenIndex) {
                link = (doc.tokens[(link as LinkRef).mainTokenIndex] as TokenLink).link
            }
            if (link) {
                for (let i of (link as LinkMain).childTokenIndex) {
                    const token = doc.tokens[i]
                    const highlight = this.getHighlightFromToken(token, DocumentHighlightKind.Text)
                    if (highlight) {
                        highlightList.push(highlight)
                    }
                }
            }
        }

        if (highlightList.length === 0) {
            const highlight = this.getHighlightFromToken(token, DocumentHighlightKind.Text, col)
            if (highlight) {
                highlightList.push(highlight)
            }
        }

        highlightList.sort((a, b) => a.range.start.line === b.range.end.line ? a.range.start.character - b.range.end.character : a.range.start.line - b.range.end.line)
        return highlightList
    }
}
