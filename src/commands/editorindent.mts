import {
    ExtensionContext,
    Position,
    Selection,
    TextEditor,
    TextEditorEdit,
    TextEditorOptions,
    TextLine
} from 'vscode'
import { Command } from '../nako3command.mjs'
import { logger } from '../logger.mjs'

export class EditorIndent implements Command {
    public readonly id = 'nadesiko3highlight.editor.indent'
    public readonly type = 'editor'

    protected log = logger.fromKey('/commands/EditorIndent')

    public constructor(
        private readonly context: ExtensionContext
    ) {
     }

    private indent (editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indent')
        log.debug(`command:editor.indent`)
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                this.indentPosition(selection.active, editor, edit)
            } else {
                this.indentSelection(selection, editor, edit)
            }
        }
    }

    private indentPosition(position: Position, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentPosition')
        let indentStr: string
        if (editor.options.insertSpaces as boolean) {
            indentStr = this.createIndentString(editor.options)
        } else {
            const lineText = editor.document.lineAt(position).text
            const indentEndCharacter = lineText.search(/[^\t]|$/)
    
            // TODO: when not in indentation, detect where to align to based on the upper and lower lines
            //       e.g.:
            //          const foo: number = ...;
            //          const x:[cursor] number = ...;
            //          const bar: number = ...;
            //       pressing tab ->
            //          const foo: number = ...;
            //          const x:   number = ...;
            //          const bar: number = ...;
            if (position.character <= indentEndCharacter) {
                indentStr = '\t'
            } else {
                indentStr = ' '.repeat(editor.options.tabSize as number)
            }
        }
        edit.insert(position, indentStr)
    }

    private indentSelection(selection: Selection, editor: TextEditor, edit: TextEditorEdit):void {
        const indentStr = this.createIndentString(editor.options)

		const startLineIndex = selection.start.line
		const endLineIndex = selection.end.line - selection.end.character === 0 ? 1 : 0

		for (let lineIndex = startLineIndex; lineIndex <= endLineIndex; lineIndex++) {
			const line = editor.document.lineAt(lineIndex)

			if (line.range.isEmpty) {
				continue
			}

			edit.insert(new Position(lineIndex, 0), indentStr)
		}
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
        this.indent(editor, edit)
    }
}
