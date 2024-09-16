export type RuntimeEnv = 'wnako'|'cnako'|'snako'|''

export interface DeclareThing {
    name: string
    type: string
    args?: string[]
    isExport: boolean
    isPrivate: boolean
}

export type DeclareThings = Map<string, DeclareThing>
