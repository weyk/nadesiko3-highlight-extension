import {
    ExtensionContext,
    Selection,
    TextEditor,
    TextEditorEdit,
    TextLine
} from 'vscode'
import { Command } from '../nako3command.mjs'
import { logger } from '../logger.mjs'

export class EditorNewLine implements Command {
    public readonly id = 'nadesiko3highlight.editor.newline'
    public readonly type = 'editor'

    protected log = logger.fromKey('/commands/EditorNewLine')

    public constructor(
        private readonly context: ExtensionContext
    ) {
     }

    private enterNewLine (editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.enterNewLine')
        log.debug(`command:editor.newline`)
        for (const selection of editor.selections) {
            this.newlineSelection(selection, editor, edit)
        }
    }

    private newlineSelection(selection: Selection, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.newlineSelection')
        const startLine: TextLine = editor.document.lineAt(selection.start)

        // 選択範囲の開始位置を含む行のインデント部分の文字列を返す。
        const leadingWhitespace: string = startLine.text
            .substring(
                0,
                Math.min(startLine.firstNonWhitespaceCharacterIndex, selection.start.character),
            )
    
        // 選択範囲は改行に置き換えることになるので削除。
        edit.delete(selection)
        // 選択範囲の有った位置に改行文字と元の行と同じインデント部分を付け足す。
        edit.insert(selection.start, "\n" + leadingWhitespace)
    }

    public execute(editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.execute')
        log.info(`■ start`)
        log.debug(`editor:`)
        log.debug(editor)
        log.debug(`edit:`)
        log.debug(edit)
        this.enterNewLine(editor, edit)
    }
}
