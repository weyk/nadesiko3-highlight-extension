import {
    CancellationToken,
    DocumentSemanticTokensProvider,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    TextDocument
} from 'vscode'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { COL_START } from '../nako3lexer.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nako3diagnostic } from '../nako3diagnotic.mjs'
import { logger } from '../logger.mjs'
import type { Token } from '../nako3token.mjs'

type HighlightMap = {[k:string]: string | [string, string |string[]]}
const hilightMapping: HighlightMap = {
    bigint: 'number',
    number: 'number',
    COMMENT_LINE: 'comment',
    COMMENT_BLOCK: 'comment',
    STRING_EX: 'string',
    string: 'string',
    FUNCTION_DECLARE: 'keyword',
    FUNCTION_ATTRIBUTE: 'decorator',
    FUNCTION_ATTR_SEPARATOR: 'decorator',
    FUNCTION_ATTR_PARENTIS: 'decorator',
    FUNCTION_ARG_PARAMETER: 'parameter',
    FUNCTION_ARG_SEPARATOR: 'keyword',
    FUNCTION_ARG_PARENTIS: 'keyword',
    FUNCTION_NAME: ['function', 'declaration'],
    STRING_INJECT_START: 'keyword',
    STRING_INJECT_END: 'keyword',
    sys_const: ['variable', ['defaultLibrary', 'readonly']],
    sys_func: ['function', ['defaultLibrary']],
    sys_var: ['variable', ['defaultLibrary']],
    user_func: 'function',
    user_const: ['variable', ['readonly']],
    user_var: 'variable',
    ここから: 'keyword',
    ここまで: 'keyword',
    もし: 'keyword',
    ならば: 'keyword',                                                                                                                                                                                          
    違えば: 'keyword',
    とは: 'keyword',
    には: 'keyword',
    回: 'keyword',
    間: 'keyword',
    繰返: 'keyword',
    増繰返: 'keyword',
    減繰返: 'keyword',
    後判定: 'keyword',
    反復: 'keyword',
    抜ける: 'keyword',
    続ける: 'keyword',
    戻る: 'keyword',
    先に: 'keyword',
    次に: 'keyword',
    実行速度優先: 'keyword',
    パフォーマンスモニタ適用: 'keyword',
    定める: 'keyword',
    代入: 'keyword',
    条件分岐: 'keyword',
    増: 'keyword',
    減: 'keyword',
    変数: 'type',
    定数: 'type',
    エラー監視: 'keyword',
    エラー: 'keyword',
    エラーならば: 'keyword',
    インデント構文: 'keyword',
    DNCLモード: 'keyword',
    DNCL2モード: 'keyword',
    モード設定: 'keyword',
    取込: 'keyword',
    モジュール公開既定値: 'keyword',
    逐次実行: ['keyword', ['deprecated']],
    厳チェック: 'keyword',
    shift_r0: 'operator',
    shift_r: 'operator',
    shift_l: 'operator',
    gteq: 'operator',
    lteq: 'operator',
    noteq: 'operator',
    eq: 'operator',
    gt: 'operator',
    lt: 'operator',
    not: 'operator',
    and: 'operator',
    or: 'operator',
    '+': 'operator',
    '-': 'operator',
    '**': 'operator',
    '*': 'operator',
    '@': 'operator',
    '÷÷': 'operator',
    '÷': 'operator',
    '%': 'operator',
    '^': 'operator',
    '&': 'operator',
    '===': 'operator',
    '!==': 'operator',
    ':': 'operator',
    'def_func': 'keyword',
    '_eol': 'keyword',
    '!': 'keyword'
}

const tokenTypes = ['function', 'variable', 'comment', 'string', 'number', 'keyword', 'operator', 'type', 'parameter', 'decorator']
const tokenModifiers = ['declaration', 'documentation', 'defaultLibrary', 'deprecated', 'readonly']

export const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

export class Nako3DocumentSemanticTokensProvider implements DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: TextDocument, canceltoken: CancellationToken): Promise<SemanticTokens> {
        const tokensBuilder = new SemanticTokensBuilder()
        let symbols: SemanticTokens =  tokensBuilder.build()
        if (canceltoken.isCancellationRequested) {
            logger.debug(`provideDocumentSemanticTokens: canceled begining`)
            return symbols
        }
        const nako3doc = nako3docs.get(document)
        if (nako3doc) {
            await nako3doc.updateText(document, canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentSemanticTokens: canceled updateText`)
                return symbols
            }
            await nako3doc.tokenize(canceltoken)
            if (canceltoken.isCancellationRequested) {
                logger.debug(`provideDocumentSemanticTokens: canceled begining`)
                return symbols
            }
            if (!nako3doc.cache.semanticTokens || nako3doc.cache.semanticTokensSerialId !== nako3doc.nako3doc.applyerVarTokenSerialId) {
                const workSymbols = this.getSemanticTokens(nako3doc)
                if (canceltoken.isCancellationRequested) {
                    return symbols
                }
                nako3doc.cache.semanticTokens = workSymbols
                nako3doc.cache.semanticTokensSerialId = nako3doc.nako3doc.applyerVarTokenSerialId
                logger.info('call getSymbols')
            } else {
                logger.info('skip getSymbols')
            }
            symbols = nako3doc.cache.semanticTokens
            if (canceltoken.isCancellationRequested) {
                return symbols
            }
            await nako3diagnostic.refreshDiagnostics(canceltoken)
        } else {
            const tokensBuilder = new SemanticTokensBuilder()
            symbols = tokensBuilder.build()
        }
		return symbols
    }

    private getSemanticTokens (doc: Nako3DocumentExt): SemanticTokens {
        const tokens = doc.nako3doc.tokens
        const commentTokens = doc.nako3doc.commentTokens
        const lengthLines = doc.nako3doc.lengthLines
        const symbols = this.computeSemanticToken(tokens, commentTokens, lengthLines, doc)
        return symbols
    }
    
    private computeSemanticToken(logicTokens: Token[], commentTokens: Token[], lengthLines: number[], doc: Nako3DocumentExt): SemanticTokens {
        const tokensBuilder = new SemanticTokensBuilder()
        let logicIndex = 0
        let commentIndex = 0
        while (logicIndex < logicTokens.length || commentIndex < commentTokens.length) {
            let token: Token
            if (commentIndex === commentTokens.length ||
                (logicTokens[logicIndex].startLine < commentTokens[commentIndex].startLine) ||
                (logicTokens[logicIndex].startLine === commentTokens[commentIndex].startLine && logicTokens[logicIndex].startCol < commentTokens[commentIndex].startCol)) {
                token = logicTokens[logicIndex]
                logicIndex++
            } else {
                token = commentTokens[commentIndex]
                commentIndex++
            }
            const highlightClass = hilightMapping[token.type]
            if (highlightClass) {
                let tokenType:string
                let tokenModifier:string[]
                if (typeof highlightClass === 'string') {
                    tokenType = highlightClass
                    tokenModifier = []
                } else {
                    tokenType = highlightClass[0]
                    if (typeof highlightClass[1] === 'string') {
                        tokenModifier = [highlightClass[1]]
                    } else {
                        tokenModifier = highlightClass[1]
                    }
                }
                // console.log(`${tokenType} range(${token.startLine}:${token.startCol}-${token.endLine}:${token.endCol})`)
                let endCol = token.endCol
                let len = token.len
                if (token.type === 'word' || tokenType === 'string' || tokenType === 'number' || tokenType === 'function' || tokenType === 'variable') {
                    endCol = token.resEndCol
                }
                // console.log(`${tokenType}[${tokenModifier}] range(${token.startLine}:${token.startCol}-${token.endLine}:${endCol})`)
                const tokenTypeIndex = tokenTypes.indexOf(tokenType)
                let ng = false
                if (tokenTypeIndex === -1) {
                    console.log(`type:${tokenType} no include lengend`)
                    ng = true
                }
                let tokenModifierBits = 0
                for (const modifier of tokenModifier) {
                    const tokenModifierIndex = tokenModifiers.indexOf(modifier)
                    if (tokenTypeIndex === -1) {
                        console.log(`modifier:${modifier} no include lengend`)
                        ng = true
                        continue
                    }
                    tokenModifierBits |= 1 << tokenModifierIndex
                }
                if (!ng) {
                    let col = token.startCol
                    for (let i = token.startLine;i <= token.endLine;i++) {
                        if (i === token.endLine) {
                            len = endCol - col
                        } else {
                            len = lengthLines[i] - col
                        }
                        // console.log(`push ${i}:${col}-${len} ${tokenTypeIndex}[${tokenModifierBits}]`)
                        tokensBuilder.push(i, col, len, tokenTypeIndex, tokenModifierBits)
                        col = COL_START
                    }
                }
            }
        }
        return tokensBuilder.build()
    }
}
