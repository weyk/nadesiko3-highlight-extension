import { l10n, window } from 'vscode'

export const messages = new Map<string,string>([
    ['noFuncParamParentisR', 'not found right parentis in function parameters({type})'],
    ['unknownTokenInFuncParam', 'unknown token in function parameters({type})'],
    ['invalidChar', 'invalid character(code:{code})'],
    ['unclosedBlockComment', 'unclose block comment'],
    ['stringInStringStartChar', 'string start character in same string({startTag})'],
    ['unclosedPlaceHolder', 'unclose wave parentis in template string'],
    ['unclosedString', 'unclose string'],
    ['deprecatedAsync', 'deplacated:"非同期モード"'],
    ['noSupportDNCL', 'No support DNCL/DNCL2 mode'],
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
    ['noImportNako3file', 'File not found by nako3 import(file:{file})'],
    ['disabledImportFromRemoteNako3', 'Disabled setting nako3 file from remote site : file {file}'],
    ['disabledImportFromRemotePlugin', 'Disabled setting javascript plugin from remote site : file {file}'],
    ['errorImportNako3file', 'Cause error in import nako3 file(file:{file})'],
    ['unknownImport', 'Unknwon type impoted "{file}". ignored'],
    ['unsupportImportFromRemote', 'No support plugin from remote site : plugin {plugin}'],
    ['noSupport3rdPlugin', 'No support plugin information for 3rd party plugin {plugin}'],
    ['errorImport3rdPlugin', 'Cause error in 3rd party plugin(plugin:{plugin})'],
    //
    ['documentIsDirty', 'document is dirty, Retry after save.'],
    ['unknownRuntime','Unknown nadesiko3 runtime. Retry write shebang line.'],
    ['unsupportRuntimeOnLaunch', 'Unsupport launch wnako3 program.'],
    ['unknwonNadesiko3home','Unknown nadesiko3 installed directory. Set nadesiko3 folder setting.'],
    ['unknwonCWD', 'Unknown working directory! Try to save the file before running.'],
    ['cannnotDeleteFile', 'Processfile cannot be deleted ({error}:{file})'],
    ['conflictNakoRuntime', 'Conflict runtime depend imported plugin'],
    // parser
    ['errorParse', 'Invalid token at parser:{nodeset}'],
    ['failParse', 'Parse filed:{nodestr}'],
    ['invalidLet', 'Invalid in let statement:{nodestr}'],
    ['invalidLetWithMessage', 'Invalid in let statement:{nodestr}\n{msg}'],
    ['noRightOperand', 'No value of operator("{op}") right'],
    ['notfondOneWordFunc', 'Not found one word function "{funcName}"'],
    ['noParamForOneWordFunc', 'Not enough parameter for one word function "{funcName}", reuire {paramCount}'],
    ['ErrorInDeclareFunction', 'Error in declare function({name}) by called(meta:{MetaIsNull})'],
    ['noKokomadeAtTry', 'Require "ここまで" for "エラー監視" statement'],
    ['noKokomadeAtForLoop', 'Require "ここまで" for "回" statement'],
    ['noKokomadeAtForOf', 'Require "ここまで" for "反復" statement'],
    ['noKokomadeAtLoop', 'Require "ここまで" for "繰り返す" statement'],
    ['noKokomadeAtWhile', 'Require "ここまで" for "間" statement'],
    ['noKokomadeAtNiwa', 'Require "ここまで" for "には" anonymous function'],
    ['unusedWordInLineWithSuggest', 'Unused word("{desc}") in line.\n, suggest:{descFunc}'],
    ['remainStack', ''],
    ['usedBy', ''],
    ['cannotkokomade', 'Cannot use "ここまで" in "インデント構文" on'],
    ['unknownToken', '[System Error] Cannot convert unknown token to ast:type:{type}'],
    ['noCatchAtTry', 'Require "エラーならば" fro "エラー監視" statement'],
    ['invalidOptionForPerformanceMonitor', 'Invalid option "{opt}" for "パフォーマンスモニタ適用"'],
    ['tikujiDeprecated', '"逐次実行" was deprecated'],
    ['cannnotSetToFunction', 'Cannot set value to function'],
    ['errorInFuncdefDupArg', 'Duplicate declare argument in function({nodestr)'],
    ['noKokomadeAtFunc', 'Require "ここまで" for declare function'],
    ['noExprWhile', 'While require condition'],
    ['requireLfAfterWhile', 'While must follow LF'],
    ['cannnotDeclareOtherModule', 'Cannnot declare variable with scope'],
    ['errorInternalFor', '[System Error] Error at "増繰り返し"/"減繰り返し" statement'],
    ['letFromToAtFor', 'Rquire "(変数名)をAからBまで繰り返す" syntax'],
    ['errorFromToAtFor', 'Rquire "AからBまで" at "繰り返す" statement'],
    ['returnWithMultiStack', '”戻" with unused parameter, will use parentis.'],
    ['invalidConditionAtIf', 'Error in condition expression in "もし".{nodestr}'],
    ['complicatedIfCond', 'Too complicted condition epression in "もし".{nodestr}'],
    ['complicatedIfCondOrNoNaraba', 'Too complicted condition epression or not found "ならば" in "もし".{nodestr}'],
    ['exceptionInIfCond', 'Cause exception at condition expression in "もし".\n{msg}'],
    ['noKokomadeAtIf', 'Require "ここまで" for "もし" statement'],
    ['invlaidOptimizeOption', 'Invalid option({option}) for "実行速度優先"'],
    ['invalidParamInRange', 'Invalid parameter for range operator("…")'],
    ['noCommandInSystemPlugin', 'Not found "{command}" function in system plugin'],
    ['errorInExpression', 'Error in expression'],
    ['requireParentisCloseInCfunction', 'No close parentis for c-stype function'],
    ['suggestPrint', 'Please "??(expression)'],
    ['suggestForEach', 'Please "(変数名)で(配列)を反復"'],
    ['suggestSwitch', 'Please "(値)で条件分岐"'],
    ['switchFollowLF', 'Require LF after "条件分岐" statement'],
    ['suggestSwitchCase', 'Please "(条件)ならば〜ここまで" for "条件分岐"'],
    ['requireNarabaForSwitch', 'Reuqire "ならば" for "条件分岐" condition'],
    ['suggestDainyu', 'Require variable name, please "(変数名)に(値)を代入"'],
    ['suggestSadameru', 'Require constatnt name, please "(定数名)を(値)に定める"'],
    ['errorSadameruAttr', 'Error attribute in "定める"'],
    ['acceptBroken', 'Accept broken: type={type}'],
    ['nomoreToken', 'No more token'],
    ['suggestIncDec', 'No number in "{type}" statement, please use "(変数名)を(値)だけ{type}'],
    ['errorInMumeiFunc', 'Cause below error in "{func}には..." anonymous function\n{message}'],
    ['notFoundDefFunction', 'Not found declare function, only "Fには" phrase'],
    ['requireCloseParentisForArrayInit', 'Require close parentis for array initialize list'],
    ['requireCloseParentisForDictInit', 'Require close parentis for dictionary initialize list'],
    ['checkedButNotget', '[System Error]Success check, but get failed'],
    ['parseErrorNear', 'Parse (...) error near {nodestr}'],
    ['funcArgN', '{n}th arguments'],
    ['paramRequireFuncObj', 'Require function object for parameter "{varname}" of function "{func}"'],
    ['notEnogthArgs', 'Not enough parameter of function "{func}"'],
    ['valueIsEmpty', 'Value is empty'],
    ['errorDeclareLocalVars', 'Error in declare local variable "{varname}"'],
    ['suggestMultipleLetConstInNth', 'Error on multiple let in {n}th. Please "定数[A,B,C]=[1,2,3]』"'],
    ['suggestMultipleLetConst', 'Error on multiple let. Please "定数[A,B,C]=[1,2,3]』"'],
    ['suggestMultipleLetVarInNth', 'Error on multiple let in {n}th. Please "変数[A,B,C]=[1,2,3]』"'],
    ['suggestMultipleLetVar', 'Error on multiple let. Please "変数[A,B,C]=[1,2,3]』"'],
    ['invalidAfterAtmark', 'Invalid variable after atmark accessor'],
    ['missArrayIndex', 'Miss at index for array "{arrayname}"'],
    ['errorCallForCstyleFunc', 'Error on call of c-style function'],
    ['mismatchFunctionArgumentNumber', 'Mismatch function "{funcname}" declared arguments number {defargsnum} vs function call arguments number {realargsnnum}'],
    // RenameProvider
    ['cannnotRenameInPluginEntry', '"{name}" is entity of plugin, it cannot rename'],
    ['cannnotRenameInRemoteEntry', '"{name}" is entity of remote file, it cannot rename'],
    ['cannnotRenameThis', 'This item cannnot rename'],
    ['unknwonWord', 'Unknown word "{value}".'],
    ['noURI', 'Cannnot execute, no uri.']
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