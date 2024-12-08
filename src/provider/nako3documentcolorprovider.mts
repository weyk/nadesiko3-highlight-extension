import {
    CancellationToken,
    DocumentColorProvider,
    Position,
    Range,
    TextDocument,
    TextEdit,
    ColorInformation,
    Color,
    ColorPresentation
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Nako3Range } from '../nako3range.mjs'
import { trimQuote } from '../nako3util.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { cssColor, ColorFormat, ColorInfo } from '../csscolor.mjs'
import { nako3extensionOption } from '../nako3option.mjs'
import { nako3diagnostic } from './nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { Token, TokenRefVar } from '../nako3token.mjs'
import type { GlobalConstant } from '../nako3types.mjs'

type ColorPresentationsContext = { readonly document: TextDocument; readonly range: Range }

export class Nako3DocumentColorProvider implements DocumentColorProvider {
    async provideDocumentColors(document: TextDocument, canceltoken: CancellationToken): Promise<ColorInformation[]|undefined> {
        logger.info(`■ DocumentColorProvider: provideDocumentColors`)
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
        logger.info(`■ DocumentSymbolProvider: provideColorPresentations`)
        return this.computeColorPresentations(color, context)
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
        for (const token of doc.nako3doc.tokens) {
            if (token.type === 'sys_const' || token.type === 'user_const') {
                const vars =  token as TokenRefVar
                const meta = vars.meta as GlobalConstant
                if (meta.isColor === true && meta.hint) {
                    if (meta.range) {
                        if (meta.range.startLine === token.startLine && meta.range.startCol === token.startCol) {
                            continue
                        }
                    }
                    const rgba = cssColor.getRgba(trimQuote(meta.hint))
                    if (rgba !== null) {
                        const [ r, g, b, a] = rgba
                        const color = new Color(r, g, b, a)
                        const colorInfo = new ColorInformation(this.getRangeFromTokenContent(token), color)
                        colorInfos.push(colorInfo)
                    }
                }
            } else if (nako3extensionOption.useLazyColorPresent && token.type === 'string') {
                const c = cssColor.parseColor(token.value)
                if (c) {
                    const color = new Color(c.red, c.green, c.blue, c.alpha === undefined ? 1.0 : c.alpha)
                    const colorInfo = new ColorInformation(this.getRangeFromTokenContent(token), color)
                    colorInfos.push(colorInfo)
                }
            }
        }
        return colorInfos
    }

    private computeColorPresentations(color: Color, context: ColorPresentationsContext): ColorPresentation[] {
        const document = context.document
        const stringQuotes = [
            { startChar: '\'', endChar: '\''  },
            { startChar: '’' , endChar: '’'   },
            { startChar: '『', endChar: '』'  },
            { startChar: '🌿', endChar: '🌿' },
            { startChar: '"' , endChar: '"'   },
            { startChar: '”' , endChar: '”'   },
            { startChar: '「', endChar: '」'  },
            { startChar: '“' , endChar: '”'   },
            { startChar: '🌴', endChar: '🌴' }
        ]
        const text = document.getText(context.range)
        logger.debug(`subtext: ${text}`)
        let value = text
        let quote: any|null = null
        for (const q of stringQuotes) {
            if (text.startsWith(q.startChar) && text.endsWith(q.endChar)) {
                quote = q
                value = text.slice(q.startChar.length, - q.endChar.length)
            }
        }
        if (!quote) {
            logger.debug(`quote : ${quote}`)
        }
        logger.debug(`value : ${value}`)

        let colorFormat: ColorFormat                                                                                                                                                                                                                                                                                                                                                                                      
        let colorInfo = cssColor.parseColor(value)
        if (colorInfo) { 
            colorFormat = colorInfo.colorFormat

            if (Math.round(colorInfo.red * 255) === Math.round(color.red * 255) && Math.round(colorInfo.green * 255) === Math.round(color.green * 255) && Math.round(colorInfo.blue * 255) === Math.round(color.blue * 255) && Math.round((colorInfo.alpha === undefined ? 1 : colorInfo.alpha) * 255) === Math.round(color.alpha  * 255)) {
                logger.debug(`old color format : ${colorFormat}`)
                if (colorFormat === null) {
                    colorFormat = '#6'
                } else {
                    switch (colorFormat) {
                    case '#6':
                    case '#8':
                        colorFormat = 'rgb(,)'
                        break
                    case 'rgb(,)':
                        colorFormat = 'rgb(,)%'
                        break
                    default:
                        colorFormat = '#6'
                        break
                    }
                }
                logger.debug(`new color format : ${colorFormat}`)
            } else {
                logger.debug(`color changed : ${colorFormat}`)
                logger.debug(`   red: ${colorInfo.red} - ${color.red}`)
                logger.debug(` green: ${colorInfo.green} - ${color.green}`)
                logger.debug(`  blue: ${colorInfo.blue} - ${color.blue}`)
                logger.debug(` alpha: ${colorInfo.alpha} - ${color.alpha}`)
            }
        } else {
            colorFormat = '#6'
            logger.debug(`before format is const : ${colorFormat}`)
        }

        if (color.alpha !== 1) {
            if (colorFormat === '#6') {
                colorFormat = '#8'
            }
        }

        let newText: string = ''
        let alphaText: string = ''
        switch (colorFormat) {
        case '#6':
            newText = `#${('0'+(color.red * 255).toString(16)).slice(-2)}${('0'+(color.green * 255).toString(16)).slice(-2)}${('0'+(color.blue * 255).toString(16)).slice(-2)}`.toUpperCase()
            break
        case '#8':
            newText = `#${('0'+(color.red * 255).toString(16)).slice(-2)}${('0'+(color.green * 255).toString(16)).slice(-2)}${('0'+(color.blue * 255).toString(16)).slice(-2)}${('0'+(color.alpha * 255).toString(16)).slice(-2)}`.toUpperCase()
            break
        case 'rgb(,)':
            alphaText =  color.alpha === 1 ? '' : `, ${Math.round(Math.round(color.alpha * 100) / 100)}`
            newText = `rgb(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}${alphaText})`
            break
        case 'rgb(,)%':
            alphaText = color.alpha === 1 ? '' : `, ${Math.round(color.alpha * 100)}%`
            newText = `rgb(${Math.round(color.red * 1000) / 10}%, ${Math.round(color.green * 1000) / 10}%, ${Math.round(color.blue * 1000) / 10}%${alphaText})`
            break
        }

        const c = new ColorPresentation(newText)
        if (quote !== null) {
            newText = quote.startChar + newText + quote.endChar    
        } else /* if (colorFormat !== 'const') */ {
            newText = `「${newText}」`
        }
        c.textEdit = TextEdit.replace(context.range, newText)
        return [c]
    }
}

