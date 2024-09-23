import { l10n, window } from 'vscode'

export const messages = new Map<string,string>([
    ['noFuncParamParentisR', 'not found right parentis in function parameters({type})'],
    ['unknownTokenInFuncParam', 'unknown token in function parameters({type})'],
    ['invalidChar', 'invalid character(code:{code})'],
    ['unclosedBlockComment', 'unclose block comment'],
    ['stringInStringStartChar', 'string start character in same string({startTag})'],
    ['unclosedPlaceHolder', 'unclose wave parentis in template string'],
    ['unclosedString', 'unclose string'],
    // in nako3document
    ['mustThenFollowIf', 'moshi must follow naraba same line'],
    ['kokomadeUseInIndentMode', 'cannot use kokomade in indent semantic mode'],
    ['invalidTokenKokomade', 'invalid token kokomade:{nestLevel}:{statement}'],
    ['invalidTokenNaraba', 'invalid token naraba:{nestLevel}:{statement}'],
    ['invalidTokenChigaeba', 'invalid token chgaeba:{nestLevel}:{statement}'],
    ['invalidTokenErrorNaraba', 'invalid token error-naraba:{nestLevel}:{statement}'],
    ['declareFuncMustGlobal', 'declare function must global scopse'],
    ['syntaxError', 'syntax error'],
    ['noCloseStatement', 'no closed statement({type})'],
    ['invalidTokenInPreprocess', 'Invalid token in preprocess command line({type}:{value})'],
    ['invalidTokenInPreprocessExpected', 'Invalid token in preprocess command line(Expected:{expected} - Real:{type}:{value})'],
    ['cannotUseTemplateString', 'Cannot use template string, only uses normal string'],
    ['noPluginInfo', 'No Plugin information for {plugin}'],
    ['noImportNako3', 'No support analizing import nako3 file {file}'],
    ['unknownImport', 'Unknwon type impoted "{file}". ignored'],
    ['noSupport3rdPlugin', 'No support plugin information for 3rd party plugin {plugin}'],
    //
    ['documentIsDirty', 'document is dirty, Retry after save.'],
    ['unknownRuntime','Unknown nadesiko3 runtime. Retry write shebang line.'],
    ['unsupportRuntimeOnLaunch', 'Unsupport launch wnako3 program.'],
    ['unknwonNadesiko3home','Unknown nadesiko3 installed directory. Set nadesiko3 folder setting.'],
    ['unknwonCWD', 'Unknown working directory! Try to save the file before running.'],
    ['cannnotDeleteFile', 'Processfile cannot be deleted ({error}:{file})'],
    ['conflictRuntimeEnv', 'Conflict runtime depend imported plugin'],
    // parser
    ['invalidLet', 'Invalid in let statement:{nodestr}'],
    ['invalidLetWithMessage', 'Invalid in let statement:{nodestr}\n{msg}'],
    ['noRightOperand', 'No value of operator("{op}") right'],
    ['notfondOneWordFunc', 'Not found one word function "{funcName}"'],
    ['noParamForOneWordFunc', 'Not enough parameter for one word function "{funcName}", reuire {paramCount}'],
    ['ErrorInDeclareFunction', 'Error in declare function by called(meta:{MetaIsNull})']
])

export type MessageArgs = Record<string, string|number>
export type ShowMessageLevel = 'ERROR'|'WARN'|'INFO'

export function getMessageWithArgs (messageId: string, args: MessageArgs): string {
    let message = l10n.t(messageId)
    if (message === messageId) {
        if (messages.has(messageId)) {
            message = l10n.t(messages.get(messageId)!, args)
        } else {
            message = `unkown message id:${messageId}`
        }
    } else {
        message = l10n.t(messageId, args)
    }
    return message
}

export function showMessage(level: ShowMessageLevel, messageId: string, args: MessageArgs):void {
    const message = getMessageWithArgs(messageId, args)
    switch (level) {
    case 'ERROR':
        window.showErrorMessage(message)
        break
    case 'WARN':
        window.showWarningMessage(message)
        break
    case 'INFO':
        window.showInformationMessage(message)
        break
    }
}