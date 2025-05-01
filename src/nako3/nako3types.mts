import { Nako3Range } from '../nako3range.mjs'
import type { Uri } from './nako3typebase.mjs'
export { Uri }

export type NakoRuntime = 'wnako'|'cnako'|'snako'|''
export type DeclareOrigin = 'plugin'|'global'|'local'|'system'
export interface FunctionArg {
  varname: string
  attr: string[]
  josi: string[]
  range: Nako3Range|null
}

export type ScopeIdRange = [ string, number, number ]

export interface DeclareBase {
  name: string
  nameNormalized: string
  activeDeclare: boolean
  range: Nako3Range|null
  origin: DeclareOrigin
  hint?: string
}

export interface GlobalBase extends DeclareBase {
  modName: string
  uri?: Uri
  isExport: boolean
  isPrivate: boolean
  isRemote: boolean
}

export interface LocalBase extends DeclareBase {
  scopeId: string
}

export interface FunctionBase extends DeclareBase {
  type: 'func'
  args?: FunctionArg[]
  isMumei: boolean
  isPure: boolean
  isAsync: boolean
  isVariableJosi: boolean
}

export interface VariableBase extends DeclareBase {
  type: 'var'|'parameter'
}

export interface ConstantBase extends DeclareBase {
  type: 'const'
  value: string
}

export interface GlobalFunction extends GlobalBase, FunctionBase {
  scopeId: string|null
}

export interface GlobalVariable extends GlobalBase, VariableBase {
  type: 'var'
}

export interface GlobalConstant extends GlobalBase, ConstantBase {
  isColor?: boolean
}

export interface LocalVariable extends LocalBase, VariableBase {
}
2
export interface LocalConstant extends LocalBase, ConstantBase {
  isColor?: boolean
}

export type GlobalVarConst = GlobalVariable | GlobalConstant
export type DeclareThing = GlobalFunction | GlobalVarConst

export type LocalVarConst = LocalVariable | LocalConstant
export interface ExternalInfo {
  uri: Uri
  filepath: string
  things: DeclareThings
  funcSid: number
  allSid: number
}
export type DeclareThings = Map<string, DeclareThing>
export type DeclareFunctions = Map<string, GlobalFunction>
export type DeclareVariables = Map<string, GlobalVariable>
export type LocalVarConsts = Map<string, LocalVarConst>
export type ExternThings = Map<string, ExternalInfo>
export type AllScopeVarConsts = Map<string, LocalVarConsts>

