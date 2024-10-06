import { RuntimeEnv} from './nako3types.mjs'

interface Nako3ExtensionOption {
    useParser: boolean
    defaultRuntimeEnv: RuntimeEnv
    useOperatorHint: boolean
}

export const nako3extensionOption:Nako3ExtensionOption = {
    useParser: true,
    useOperatorHint: true,
    defaultRuntimeEnv: ''
}
