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

export class Nako3DocumentHighlightProvider implements DocumentHighlightProvider {
    async provideDocumentHighlights(document: TextDocument, position: Position, canceltoken: CancellationToken): Promise<DocumentHighlight[]> {
        // console.log(`provide document highlight:${document.fileName}`)
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

    getHighlight (position: Position, doc: Nako3Document): DocumentHighlight[] {
        const line = position.line
        const col = position.character
        const token = doc.getTokenByPosition(line, col)
        if (token !== null) {
            let range:Range
            if (token.josi !== '' && typeof token.josiStartCol === 'number') {
                if (col < token.josiStartCol) {
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
            return [new DocumentHighlight(range, DocumentHighlightKind.Text)]
        }
        return []
    }
}
