import { Uri } from 'vscode'
import { Nako3Range } from './nako3range.mjs'

export type NakoRuntime = 'wnako'|'cnako'|'snako'|''
export type DeclareOrigin = 'plugin'|'global'|'local'
export interface FunctionArg {
  varname: string
  attr: string[]
  josi: string[]
  range: Nako3Range|null
}

export type ScopeIdRange = [ string, number, number ]

export interface DeclareFunction {
  name: string
  nameNormalized: string
  modName: string
  uri?: Uri
  type: 'func'
  args?: FunctionArg[]
  isMumei: boolean
  isPure: boolean
  isAsync: boolean
  isVariableJosi: boolean
  isExport: boolean
  isPrivate: boolean
  hint?: string
  range: Nako3Range|null
  scopeId: string|null
  origin: DeclareOrigin
}

export interface DeclareVariable {
  name: string
  nameNormalized: string
  modName: string
  uri?: Uri
  type: 'var'|'const'
  isExport: boolean
  isPrivate: boolean
  hint?: string
  range: Nako3Range|null
  origin: DeclareOrigin
}

export interface LocalVariable {
  name: string
  type: string
  scopeId: string
  activeDeclare: boolean
  range: Nako3Range|null
  origin: DeclareOrigin
}

export type DeclareThing = DeclareFunction | DeclareVariable

export type DeclareThings = Map<string, DeclareThing>
export type DeclareFunctions = Map<string, DeclareFunction>
export type DeclareVariables = Map<string, DeclareVariable>
export type LocalVariables = Map<string, LocalVariable>
export type ExternThings = Map<string, DeclareThings>
export type AllVariables = Map<string, LocalVariables>

export interface SourceMap {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    resEndCol: number
    uri: Uri | undefined
}
