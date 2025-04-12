import {
    ExtensionContext,
    Selection,
    TextEditor,
    TextEditorEdit,
    TextEditorOptions,
    TextLine
} from 'vscode'
import { Command } from '../nako3command.mjs'
import { logger } from '../logger.mjs'

export class EditorOutdent implements Command {
    public readonly id = 'nadesiko3highlight.editor.outdent'
    public readonly type = 'editor'

    protected log = logger.fromKey('/commands/EditorOutdent')

    public constructor(
        private readonly context: ExtensionContext
    ) {
     }

    private outdent (editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.outdent')
        log.debug(`command:editor.outdent`)
        for (const selection of editor.selections) {
            this.outdentSelection(selection, editor, edit)
        }
    }

    private outdentSelection(selection: Selection, editor: TextEditor, edit: TextEditorEdit):void {
        const indentStr = this.createIndentString(editor.options)

		const startLineIndex = selection.start.line
		const endLineIndex = selection.end.line

		for (let lineIndex = startLineIndex; lineIndex <= endLineIndex; lineIndex++) {
            this.outdentLine(lineIndex, indentStr, editor, edit)
		}
    }

    private outdentLine(lineIndex: number, indentStr: string, editor: TextEditor, edit: TextEditorEdit):void {
        const line: TextLine = editor.document.lineAt(lineIndex);

        if (!(line.text.startsWith(indentStr))) {
            return
        }
    
        const leadingIndentEnd = line.range.start.translate({ characterDelta: indentStr.length })
        const leadingIndentRange = line.range.with({ end: leadingIndentEnd })
    
        edit.delete(leadingIndentRange)
    }

    private createIndentString (editorOptions: TextEditorOptions): string {
        if (!(editorOptions.insertSpaces as boolean)) {
            return "\t"
        }

        return " ".repeat(editorOptions.tabSize as number)
    }

    public execute(editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.execute')
        log.info(`■ start`)
        log.debug(`editor:`)
        log.debug(editor)
        log.debug(`edit:`)
        log.debug(edit)
        this.outdent(editor, edit)
    }
}
