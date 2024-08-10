import * as vscode from 'vscode'
import { tokenTypes, tokenModifiers } from './nako3document.mjs'

export const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers)
