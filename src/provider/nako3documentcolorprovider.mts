import {
    CancellationToken,
    DocumentColorProvider,
    Position,
    Range,
    TextDocument,
    ColorInformation,
    Color,
    ColorPresentation
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { trimQuote } from '../nako3util.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { cssColor } from '../csscolor.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { Token, TokenRefVar } from '../nako3token.mjs'
import type { GlobalVariable, GlobalConstant } from '../nako3types.mjs'

type ColorPresentationsContext = { readonly document: TextDocument; readonly range: Range }

export class Nako3DocumentColorProvider implements DocumentColorProvider {
    async provideDocumentColors(document: TextDocument, canceltoken: CancellationToken): Promise<ColorInformation[]|undefined> {
        let colors: ColorInformation[] = []
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideDocumentColors: canceled begining`)
            return colors
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentColors: canceled after updateText`)
                return colors
            }
            await nako3docs.analyze(nako3doc, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentColors: canceled after tokeninze`)
                return colors
            }
            if (!nako3doc.cache.colors || nako3doc.cache.colorsSerialId !== nako3doc.nako3doc.applyerVarTokenSerialId) {
                const workColors = this.getColors(nako3doc)
                if (canceltoken.isCancellationRequested) {
                    return colors
                }
                nako3doc.cache.colors = workColors
                nako3doc.cache.colorsSerialId = nako3doc.nako3doc.applyerVarTokenSerialId
                logger.info('call getColors')
            } else {
                logger.info('skip getColors')
            }
            colors = nako3doc.cache.colors
            if (canceltoken.isCancellationRequested) {
                return colors
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        }
		return colors
    }

    async provideColorPresentations(color: Color, context: ColorPresentationsContext, canceltoken: CancellationToken): Promise<ColorPresentation[]|undefined> {
        return undefined
    }

    private getColors (doc: Nako3DocumentExt): ColorInformation[] {
        const colors = this.computeDocumentColors(doc)
        return colors
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

    private computeDocumentColors(doc: Nako3DocumentExt): ColorInformation[] {
        const colorInfos: ColorInformation[] = []
        // plugin-var/const
        for (const token of doc.nako3doc.tokens) {
            if (token.type === 'sys_const') {
                const vars =  token as TokenRefVar
                const meta = vars.meta as GlobalConstant
                if (meta.isColor === true && meta.hint) {
                    const rgba = cssColor.getRgba(trimQuote(meta.hint))
                    if (rgba !== null) {
                        const [ r, g, b, a] = rgba
                        const color = new Color(r, g, b, a)
                        const colorInfo = new ColorInformation(this.getRangeFromTokenContent(token), color)
                        colorInfos.push(colorInfo)
                    }
                }
            }
        }
        return colorInfos
    }
}

