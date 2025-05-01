import {
    ExtensionContext,
    Position,
    Range,
    Selection,
    TextEditor,
    TextEditorEdit,
    TextLine
} from 'vscode'
import { Command } from '../nako3command.mjs'
import { logger } from '../logger.mjs'

export class EditorIndentHan2Zen implements Command {
    public readonly id = 'nadesiko3highlight.editor.indentHanToZen'
    public readonly type = 'editor'

    protected log = logger.fromKey('/commands/EditorIndentHan2Zen')

    public constructor(
        private readonly context: ExtensionContext
    ) {
     }

     
    private indentHan2Zen (editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentHan2Zen')
        log.debug(`command:editor.indentHan2Zen`)
        for (const selection of editor.selections) {
            if (selection.isEmpty) {
                this.indentHan2ZenAll(selection.active, editor, edit)
            } else {
                this.indentHan2ZenSelection(selection, editor, edit)
            }
        }
    }

    private indentHan2ZenAll(position: Position, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentHan2ZenAll')

		for (let lineIndex = 0; lineIndex < editor.document.lineCount; lineIndex++) {
			const line = editor.document.lineAt(lineIndex)
			if (line.range.isEmpty) {
				continue
			}

            this.indentHan2ZenLine(line, edit)
		}
    }

    private indentHan2ZenSelection(selection: Selection, editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.indentHan2ZenSelection')
		const startLineIndex = selection.start.line
		const endLineIndex = selection.end.line - (selection.end.character === 0 ? 1 : 0)

		for (let lineIndex = startLineIndex; lineIndex <= endLineIndex; lineIndex++) {
			const line = editor.document.lineAt(lineIndex)
			if (line.range.isEmpty) {
				continue
			}

            this.indentHan2ZenLine(line, edit)
		}
    }

    private indentHan2ZenLine(line: TextLine, edit: TextEditorEdit) {
        const log = this.log.appendKey('.indentHan2ZenLine')
        const text = line.text
        const result = /^[ 　\t]*/.exec(text)
        if (result === null) {
            return
        }
        const leadText = result[0]
        log.debug(`leadText:"${leadText}"`)
        let indentLevel = 0
        for (let c of leadText) {
            switch (c) {
                case ' ':
                    indentLevel += 1
                    break
                case '　':
                    indentLevel += 2
                    break
                case '^t':
                    indentLevel = (indentLevel + 7) % 8
                    break
                default:
                    log.debug(`illegal character: "${c}"`)
            }
        }
        if (indentLevel === 0) {
            log.debug(`no indent`)
            return
        }
        const indentSpace = ('　'.repeat(indentLevel >>> 1)) + (indentLevel % 2 === 1 ? ' ' : '')
        if (leadText[0] !== indentSpace) {
            const startPos = new Position(line.lineNumber, line.range.start.character)
            const endPos = new Position(line.lineNumber,  line.range.start.character + leadText.length)
            edit.replace(new Range(startPos, endPos), indentSpace)
        }
    }

    public execute(editor: TextEditor, edit: TextEditorEdit):void {
        const log = this.log.appendKey('.execute')
        log.info(`■ start`)
        this.indentHan2Zen(editor, edit)
    }
}
