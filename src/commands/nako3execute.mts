import {
    ExtensionContext,
    TextDocument,
    Uri,
	ViewColumn,
	WebviewPanel,
    window,
    workspace
} from 'vscode'
import * as path from 'node:path'
import { Nako3DocumentExt } from '../nako3documentext.mjs'
import { Command } from '../nako3command.mjs'
import { nako3docs } from '../nako3interface.mjs'
import { nadesiko3 } from '../nako3nadesiko3.mjs'
import { showMessage } from '../nako3message.mjs'
import { logger } from '../logger.mjs'
import type { NakoRuntime } from '../nako3types.mjs'

export class Nako3Execute implements Command {
	public readonly id = 'nadesiko3highlight.nadesiko3.exec'
	public readonly viewType = 'nadesiko3highlight.preview'

	private webviewPanel: WebviewPanel | null = null

	public constructor(
		private readonly context: ExtensionContext
	) {
		this.registerEvents()
     }

    async execNako3 (uri: Uri) {
        logger.debug(`command:nadesiko3.exec`)
        let doc:Nako3DocumentExt|undefined
        const editor = window.activeTextEditor
        if (uri === undefined && editor) {
            uri = editor.document.uri
        }
        let nakoRuntime: NakoRuntime
        let document = workspace.textDocuments.find(f => f.uri.toString() === uri.toString())
        if (document && nako3docs.has(document)) {
            logger.log(`command:nadesiko3.exec:has document`)
            // execute from editor's text
            doc = nako3docs.get(document)
        }
        if (doc) {
            nakoRuntime = doc.nako3doc.moduleEnv.nakoRuntime
        } else {
            nakoRuntime = await this.getNakoRuntimeFromFile(uri)
        }
        if (nakoRuntime === '') {
            showMessage('WARN', 'unknownRuntime', {})
            return
        }
        let text: string|undefined
        if (doc && doc.isDirty && document) {
            logger.log(`command:nadesiko3.exec:is dirty`)
            text = document.getText()
        }
        if (nakoRuntime === 'wnako') {
            showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
            if (!text) {
                if (document) {
                    text = document.getText()
                } else {
                    try {
                        const bytes = await workspace.fs.readFile(uri)
                        text = bytes.toString()
                    } catch (err) {
                        // nop
                    }
                    if (!text) {
                        return
                    }
                }
            }

            this.execOnWebView(text)
        } else {
            this.execOnTerminal(nakoRuntime, uri, text)
        }
        this.registerEvents()
    }
    
    private async execOnTerminal(nakoRuntime: NakoRuntime, uri: Uri, text?: string) {
        if (text) {
            logger.log(`command:nadesiko3.exec:is dirty`)
            await nadesiko3.execForText(text, uri, nakoRuntime)
        } else {
            await nadesiko3.execForFile(uri, nakoRuntime)
        }
    }

    private async execOnWebView(text: string) {
		this.updatePreview(text)
    }

    private async getNakoRuntimeFromFile (uri: Uri): Promise<NakoRuntime> {
        let runtime: NakoRuntime = ''
        try {
            const bin = await workspace.fs.readFile(uri)
            const decoder = new TextDecoder('utf-8')
            const text = decoder.decode(bin)
            const r = text.match(/([^\r\n]*)(\r|\n)/)
            if (r && r.length > 0) {
                const topLine = r[0]
                if (topLine.startsWith('#!')) {
                    if (topLine.indexOf('cnako3') >= 0) {
                        runtime = 'cnako'
                    } else if (topLine.indexOf('snako') >= 0) {
                        runtime = 'snako'
                    }
                }
            }
        } catch (ex) {
            logger.info('getRuntimeFromFile: casuse error on file read')
            runtime = ''
        }
        return runtime
    }
    
	private createWebviewPanel() {
		if (this.webviewPanel) { return }

		const { activeTextEditor } = window
		const viewColumn = activeTextEditor && activeTextEditor.viewColumn ? activeTextEditor.viewColumn + 1 : ViewColumn.One
		const webviewPanel = window.createWebviewPanel(
			this.viewType,
			'Wnako Live Preview',
			viewColumn,
			{
		//		enableFindWidget: true,
				enableScripts: true,
		//		enableCommandUris: true,
			}
		)

		webviewPanel.onDidDispose(() => {
			this.webviewPanel = null
		}, null, this.context.subscriptions)

		this.webviewPanel = webviewPanel
	}

	private async wrapHTMLContentInWnako3(panel: WebviewPanel, nako3source: string): Promise<string|null> {
		const webView = panel.webview
		const wnako3path = await nadesiko3.getWnako3Path()
		const { extensionPath } = this.context
        if (wnako3path === null) {
            return null
        }
		const assistPluginJs = webView.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/plugin_assist.js')))
		const assistJs = webView.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/nako3assist.js')))
		const assistCss = webView.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/nako3assist.css')))
		const wnako3Js = webView.asWebviewUri(Uri.file(wnako3path))

		return `<!DOCTYPE html>
<html>
  <head>
	<meta charset="utf-8" />
  <link rel="stylesheet" href="${assistCss}">
  </head>
  <body>
    <div id="nako3highlight_err" class="err"></div>
    <div id="exception" class="err"></div>
    <div class="turtle_box">
      <p class="info"><a name="run">実行結果:</a> &nbsp; </p>
      <div style="text-align: left">
        <canvas id="turtle_cv" class="turtle_canvas" style="text-align: left" width="800" height="400"></canvas>
        <div id="result_div" style="text-align: left"></div>
      </div>
      <p id="nako3highlight_info" class="info"></p>
    </div>
	<script type="nako3">
${nako3source}
	</script>
	<script src="${wnako3Js}"></script>
	<script src="${assistPluginJs}"></script>
	<script src="${assistJs}"></script>
  </body>
</html> 
`
	}

	private async updatePreview(text: string): Promise<void> {
		const wnako3path = await nadesiko3.getWnako3Path()
        if (wnako3path === null) { return }
		if (!this.webviewPanel) {
            this.createWebviewPanel()
            if (!this.webviewPanel) { return }
        }
        const html = await this.wrapHTMLContentInWnako3(this.webviewPanel, text)
        if (!html) { return }
		this.webviewPanel.webview.html = html
	}

    private registerEvents() {
		this.context.subscriptions.push(
			window.onDidCloseTerminal(async (e) => {
                await nadesiko3.terminalClose(e)
            })
		)
    }

    public execute(uri: Uri) {
		this.execNako3(uri)
    }
}