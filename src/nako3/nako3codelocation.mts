import { Nako3Range } from '../nako3range.mjs'

import type { Uri } from './nako3typebase.mjs'
import type { Token } from './nako3token.mjs'
import type { Ast } from './nako_ast.mjs'

export class Nako3CodeLocation extends Nako3Range {
  uri: Uri | undefined

  constructor (start: Nako3CodeLocation|Token|Ast, end?: Nako3CodeLocation|Token|Ast) {
    if (typeof end === 'undefined') {
        end = start
    }
    super(start.startLine, start.startCol, end.endLine, end.endCol, end.resEndCol)
    this.uri = start.uri
  }

  mergeStart (start: Nako3CodeLocation|Token|Ast): Nako3CodeLocation {
    this.startLine = start.endLine
    this.startCol = start.endCol
    return this
  }

  mergeEnd (end: Nako3CodeLocation|Token|Ast): Nako3CodeLocation {
    this.endLine = end.endLine
    this.endCol = end.endCol
    this.resEndCol = end.resEndCol
    return this
  }
}