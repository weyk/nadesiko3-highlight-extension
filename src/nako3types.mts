export type RuntimeEnv = 'wnako'|'cnako'|'snako'|''

export interface FunctionArg {
  varname: string
  attr: string[]
  josi: string[]
}

export interface DeclareFunction {
  name: string
  nameNormalized: string
  modName: string
  type: string
  args?: FunctionArg[]
  isPure: boolean
  isAsync: boolean
  isVariableJosi: boolean
  isExport: boolean
  isPrivate: boolean
}

export interface DeclareVariable {
  name: string
  nameNormalized: string
  modName: string
  type: string
  isExport: boolean
  isPrivate: boolean
}

export interface LocalVariable {
  name: string
  type: string
  value: string|number
}

export type DeclareThing = DeclareFunction | DeclareVariable

export type DeclareThings = Map<string, DeclareThing>
export type DeclareFunctions = Map<string, DeclareFunction>
export type DeclareVariables = Map<string, DeclareVariable>
export type LocalVariables = Map<string, LocalVariable>

export interface ModuleOption {
  isIndentSemantic: boolean
  isPrivateDefault: boolean
  isExportDefault: boolean
}

export interface SourceMap {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
    resEndCol: number
    file: string | undefined
}

// 関数に関する定義
export type FuncArgs = string[][]

export type FuncListItemType = 'func' | 'var' | 'const' | 'test_func'

// FuncListの定義
export interface FuncListItem {
  type: FuncListItemType
  value?: any
  josi?: FuncArgs
  isVariableJosi?: boolean
  fn?: null | ((...args: any[]) => any) | string
  varnames?: string[]
  funcPointers?: any[]
  asyncFn?: boolean
  isExport?: null|boolean
  return_none?: boolean
  pure?: boolean
  name?: string
}

export type FuncList = Map<string, FuncListItem>
export type ExportMap = Map<string, boolean>
