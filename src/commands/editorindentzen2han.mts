import {
    ExtensionContext,
    Position,
    Range,
    Selection,
    TextEditor,
    TextEditorEdit,
    TextEditorOptions,
    TextLine
} from 'vscode'
import { Command } from '../nako3command.mjs'
import { logger } from '../logger.mjs'

export class EditorIndentZen2Han implements Command {
    public readonly id = 'nadesiko3highlight.editor.indentZenToHan'
    public readonly type = 'editor'

    protected log = logger.fromKey('/commands/EditorIndentZen2Han')

    public constructor(
        private readonly context: ExtensionContext
    ) {
     }

     
    private indentZen2Han (editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentZen2Han')
        log.debug(`command:editor.indentZen2Han`)
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                this.indentZen2HanAll(selection.active, editor, edit)
            } else {
                this.indentZen2HanSelection(selection, editor, edit)
            }
        }
    }

    private indentZen2HanAll(position: Position, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentZen2HanAll')

		for (let lineIndex = 0; lineIndex < editor.document.lineCount; lineIndex++) {
			const line = editor.document.lineAt(lineIndex)
			if (line.range.isEmpty) {
				continue
			}

            this.indentZen2HanLine(line, edit)
		}
    }

    private indentZen2HanSelection(selection: Selection, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentZen2HanSelection')
		const startLineIndex = selection.start.line
		const endLineIndex = selection.end.line - (selection.end.character === 0 ? 1 : 0)

		for (let lineIndex = startLineIndex; lineIndex <= endLineIndex; lineIndex++) {
			const line = editor.document.lineAt(lineIndex)
			if (line.range.isEmpty) {
				continue
			}

            this.indentZen2HanLine(line, edit)
		}
    }

    private indentZen2HanLine(line: TextLine, edit: TextEditorEdit) {
        const log = this.log.appendKey('.indentZen2HanLine')
        const text = line.text
        const result = /^[ 　\t]+/.exec(text)
        if (result) {
            const indentText = result[0]
            const result2 = indentText.matchAll(/　+/g)
            if (result2) {
                for (const r of result2) {
                    const startPos = new Position(line.lineNumber, r.index)
                    const endPos = new Position(line.lineNumber, r.index + r[0].length)
                    edit.replace(new Range(startPos, endPos), " ".repeat(r[0].length * 2))
                }
            }
        }
    }

    public execute(editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.execute')
        log.info(`■ start`)
        this.indentZen2Han(editor, edit)
    }
}
