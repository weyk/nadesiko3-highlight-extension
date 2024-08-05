import * as assert from 'node:assert'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode'
import { Nako3DocumentSemanticTokensProvider } from '../lib/extension.js'

class MockTextDocument implements vscode.TextDocument{
	myText: string
    uri!: vscode.Uri
    fileName!: string
    isUntitled!: boolean
    languageId!: string
    version!: number
    isDirty!: boolean
    isClosed!: boolean
    eol!: vscode.EndOfLine
    lineCount: number
	lines: vscode.TextLine[]
	setMyText (text: string) {
		this.myText = text
		this.lines = []
		let lineNumber = 0
		let line:string
		while (text !== '') {
			const indexCr = text.indexOf('\r')
			const indexLf = text.indexOf('\n')
			if (indexCr !== -1 && indexLf !== -1 && indexCr +1 === indexLf) {
				line = text.slice(0, indexCr + 2)
				text = text.slice(indexCr + 2)
				this.lines.push(new MockTextLine(line, new vscode.Position(lineNumber, 0)))
			} else if (indexCr !== -1 && ((indexLf !== -1 && indexCr <= indexLf) || indexLf === -1)) {
				line = text.slice(0, indexCr + 1)
				text = text.slice(indexCr + 1)
				this.lines.push(new MockTextLine(line, new vscode.Position(lineNumber, 0)))
			} else if (indexLf !== -1 && ((indexCr !== -1 && indexLf < indexCr) || indexCr === -1)) {
				line = text.slice(0, indexLf + 1)
				text = text.slice(indexLf + 1)
				this.lines.push(new MockTextLine(line, new vscode.Position(lineNumber, 0)))
			} else {				
				line = text
				text = ''
				this.lines.push(new MockTextLine(line, new vscode.Position(lineNumber, 0)))
			}
			lineNumber++
		}
		this.lineCount = lineNumber
	}
    save(): Thenable<boolean> {
        throw new Error('Method not implemented.')
    }
    lineAt(line: number): vscode.TextLine
    lineAt(position: vscode.Position): vscode.TextLine
    lineAt(arg1: number|vscode.Position): vscode.TextLine {
		if (typeof arg1 === 'number') {
			return this.lines[arg1]
		} 
		return this.lines[arg1.line]
	}
    offsetAt(position: vscode.Position): number {
        throw new Error('Method not implemented.')
    }
    positionAt(offset: number): vscode.Position {
        throw new Error('Method not implemented.')
    }
    getText(range?: vscode.Range): string {
        return this.myText
		// throw new Error('Method not implemented.');
    }
    getWordRangeAtPosition(position: vscode.Position, regex?: RegExp): vscode.Range | undefined {
        throw new Error('Method not implemented.')
    }
    validateRange(range: vscode.Range): vscode.Range {
        throw new Error('Method not implemented.')
    }
    validatePosition(position: vscode.Position): vscode.Position {
        throw new Error('Method not implemented.')
    }
}

class MockCancellationToken implements vscode.CancellationToken{
    isCancellationRequested!: boolean;
    onCancellationRequested!: vscode.Event<any>;

}

class MockTextLine implements vscode.TextLine{
    lineNumber: number
    text: string
    range: vscode.Range
	rangeIncludingLineBreak: vscode.Range
    firstNonWhitespaceCharacterIndex: number
    isEmptyOrWhitespace: boolean

	constructor (text: string, startPos: vscode.Position) {
		this.lineNumber = startPos.line
		this.rangeIncludingLineBreak = new vscode.Range(startPos, new vscode.Position(startPos.line, text.length))
		if (text.endsWith('\n')) {
			text = text.slice(-1)
		}
		if (text.endsWith('\r')) {
			text = text.slice(-1)
		}
		this.text = text
		this.range = new vscode.Range(startPos, new vscode.Position(startPos.line, text.length))

		this.isEmptyOrWhitespace = text.length === 0 || /^\s*$/.test(text)
		if (this.isEmptyOrWhitespace) {
			this.firstNonWhitespaceCharacterIndex = text.length
		} else {
			const r = /^\s*/.exec(text)
			if (r === null) {
				this.firstNonWhitespaceCharacterIndex = 0
			} else {
				this.firstNonWhitespaceCharacterIndex = r[0].length
			}
		}
	}
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.')

	test('test1', async () => {
        //値定義
        const document = new MockTextDocument()
        const token = new MockCancellationToken()
        const op:vscode.DocumentSemanticTokensProvider = new Nako3DocumentSemanticTokensProvider()
		document.setMyText("#12345\r\n●(HOGEに)実行とは\r\n　HOGEを表示する。\r\nここまで\r\n\r\n実行する。\r\n")

        const excepted = new Uint32Array([0,0,6,2,0,1,0,1,5,0,0,1,7,8,0,0,7,2,0,1,0,2,2,5,0,1,6,4,0,4,1,0,4,5,0,2,0,4,0,0])

        //実行
        let actual = await op.provideDocumentSemanticTokens(document,token)

        //アサート
        assert.notEqual(actual, null)
        assert.deepStrictEqual(actual!.data, excepted)
    })
})
