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
import { nako3extensionOption } from '../nako3option.mjs'
import { showMessage } from '../nako3message.mjs'
import { logger } from '../logger.mjs'
import type { NakoRuntime } from '../nako3types.mjs'

interface ContentResources {
    assistPluginJs: Uri
    assistJs: Uri
    assistCss: Uri
    wnako3Js: Uri
    turtleJs: Uri
    cspSource: string
}

export class Nako3Execute implements Command {
	public readonly id = 'nadesiko3highlight.nadesiko3.exec'
    public readonly type = 'normal'

    public readonly viewType = 'nadesiko3highlight.viewer'
	private webviewPanel: WebviewPanel | null = null
    protected log = logger.fromKey('/commands/Nako3Execute')

	public constructor(
		private readonly context: ExtensionContext
	) {
		this.registerEvents()
     }

    async execNako3 (uri: Uri) {
        const log = this.log.appendKey('.execNako3')
        log.debug(`command:nadesiko3.exec`)
        let doc:Nako3DocumentExt|undefined
        const editor = window.activeTextEditor
        if (uri === undefined && editor && editor.document && editor.document.uri) {
            uri = editor.document.uri
        }
        if (!uri) {
            showMessage('INFO', 'noURI', {})
            return
       }
        let nakoRuntime: NakoRuntime
        let document = workspace.textDocuments.find(f => f.uri.toString() === uri.toString())
        if (document && nako3docs.has(document)) {
            log.trace(`command:nadesiko3.exec:has document`)
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
            log.trace(`command:nadesiko3.exec:is dirty`)
            text = document.getText()
        }
        if (nakoRuntime === 'wnako') {
            // showMessage('WARN', 'unsupportRuntimeOnLaunch', {})
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
        const log = this.log.appendKey('.execOnTerminal')
        if (text) {
            log.trace(`command:nadesiko3.exec:is dirty`)
            await nadesiko3.execForText(text, uri, nakoRuntime)
        } else {
            await nadesiko3.execForFile(uri, nakoRuntime)
        }
    }

    private async execOnWebView(text: string) {
		this.updatePreview(text)
    }

    private async getNakoRuntimeFromFile (uri: Uri): Promise<NakoRuntime> {
        const log = this.log.appendKey('.getNakoRuntimeFromFile')
        let runtime: NakoRuntime = ''
        try {
            const doc = nako3docs.openFromFile(uri)
            await nako3docs.updateText(doc, uri)
            const bin = await workspace.fs.readFile(uri)
            const decoder = new TextDecoder('utf-8')
            const text = decoder.decode(bin)
            const r = text.match(/([^\r\n]*)(\r|\n)/)
            if (r && r.length > 0) {
                for (let i = 0;i < r.length; i++) {
                    const line = r[0]
                    if (i === 0) {
                        if (line.startsWith('#!')) {
                            if (line.indexOf('cnako3') >= 0) {
                                runtime = 'cnako'
                            } else if (line.indexOf('snako') >= 0) {
                                runtime = 'snako'
                            }
                        }
                    }
                }
            }
        } catch (ex) {
            log.info('getRuntimeFromFile: casuse error on file read')
            runtime = ''
        }
        return runtime
    }
    
	private createWebviewPanel(nako3ReleaseFolder: string) {
		if (this.webviewPanel) { return }

		const { activeTextEditor } = window
		const { extensionUri } = this.context
		const viewColumn = activeTextEditor && activeTextEditor.viewColumn ? activeTextEditor.viewColumn + 1 : ViewColumn.One
		const webviewPanel = window.createWebviewPanel(
			this.viewType,
			'Wnako runner',
			viewColumn,
			{
				enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [Uri.joinPath(extensionUri, 'assets'), Uri.file(nako3ReleaseFolder)]
			}
		)

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                case 'log.stdout':
                    console.log(message.data.nodeConsole)
                    return
                case 'log.info':
                    console.log(message.data.nodeConsole)
                    return
                }
            },
            undefined,
            this.context.subscriptions
        )

        webviewPanel.onDidDispose(() => {
			this.webviewPanel = null
		}, undefined, this.context.subscriptions)

		this.webviewPanel = webviewPanel
	}

    private async getContentResources(wnako3path: string, turtlepath: string, panel: WebviewPanel): Promise<ContentResources> {
		const webview = panel.webview
		const { extensionPath } = this.context
        const cspSource = webview.cspSource
		const assistPluginJs = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/plugin_assist.js')))
		const assistJs = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/nako3assist.js')))
		const assistCss = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'assets/nako3assist.css')))
		const wnako3Js = webview.asWebviewUri(Uri.file(wnako3path))
		const turtleJs = webview.asWebviewUri(Uri.file(turtlepath))
        return {
            assistPluginJs,
            assistJs,
            assistCss,
            wnako3Js,
            turtleJs,
            cspSource
        }

    }
    private async wrapHTMLContentInWnako3(nako3source: string, resources: ContentResources): Promise<string|null> {
        const nonce = this.getNonce()
        const nonceInCspCode = nako3extensionOption.enableNonceForScript ? ` 'nonce-${nonce}'` : ` ${resources.cspSource}`
        const nonceInScriptCode = nako3extensionOption.enableNonceForScript ? ` nonce="${nonce}"` : ''
        const dataScheme = nako3extensionOption.autoTurtleStart ? ` data:` : ''
        const cspCode = nako3extensionOption.enableCSP ? `<meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${resources.cspSource}${dataScheme} https:; script-src 'unsafe-eval'${nonceInCspCode}; style-src ${resources.cspSource} 'unsafe-inline' 'self'; connect-src https:;"
    />
` : ''
        const drawStartCode = nako3extensionOption.autoDrawStart ? `『#${nako3extensionOption.canvasId}』へ描画開始
` : ''
        const turtleStartCode = nako3extensionOption.autoTurtleStart ? `カメ全消去。
カメ描画先は『#${nako3extensionOption.canvasId}』。
` : ''
        const preCode = drawStartCode.length > 0 || turtleStartCode.length > 0 ? `<script type="nako3init">
${drawStartCode}${turtleStartCode}
	</script>
` : ''
        const turtleScript = nako3extensionOption.autoTurtleStart ? `<script${nonceInScriptCode} src="${resources.turtleJs}"></script>` : ``
        const canvasCode = nako3extensionOption.useCanvas ? `<canvas id="${nako3extensionOption.canvasId}" class="turtle_canvas" width="${nako3extensionOption.canvasW}" height="${nako3extensionOption.canvasH}"></canvas>
` : ''
        return `<!DOCTYPE html>
<html>
  <head>
	<meta charset="utf-8" />
    ${cspCode}
  <link rel="stylesheet" href="${resources.assistCss}">
  </head>
  <body>
    <div class="turtle_box">
      <p class="edit_head">実行結果:&nbsp; </p>
      <div class="result_div">
        ${canvasCode}
        <p id="nako3highlight_info" class="info"></p>
        <div id="nako3highlight_err" class="err hidden"></div>
        <div id="nako3highlight_exception" class="err hidden"></div>
      </div>
    </div>
    ${preCode}
	<script type="nako3">
${nako3source}
	</script>
	<script${nonceInScriptCode} src="${resources.wnako3Js}"></script>
    ${turtleScript}
	<script${nonceInScriptCode} src="${resources.assistPluginJs}"></script>
	<script${nonceInScriptCode} src="${resources.assistJs}"></script>
  </body>
</html> 
`
	}

    private getNonce() {
        let text = ''
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length))
        }
        return text
    }

    private async updatePreview(text: string): Promise<void> {
        const nako3ReleaseFolder = await nadesiko3.getReleaseFolder()
		const wnako3path = await nadesiko3.getWnako3Path()
        if (wnako3path === null || nako3ReleaseFolder === null) { return }
		const turtlepath = path.join(nako3ReleaseFolder, 'plugin_turtle.js')
		if (!this.webviewPanel) {
            this.createWebviewPanel(nako3ReleaseFolder)
            if (!this.webviewPanel) { return }
        }
        const resources = await this.getContentResources(wnako3path, turtlepath, this.webviewPanel)
        const html = await this.wrapHTMLContentInWnako3(text, resources)
        if (!html) { return }
		this.webviewPanel.webview.html = html
	}

    private registerEvents() {
		this.context.subscriptions.push(
			window.onDidCloseTerminal(async (e) => {
                const log = logger.fromKey('/commands/Nako3Execute.registerEvents:window.onDidCloseTerminal')
                log.info(`■ Nako3Execute: window.onDidCloseTerminal`)
                await nadesiko3.terminalClose(e)
            })
		)
    }

    public execute(uri: Uri) {
        const log = this.log.appendKey('.execute')
        log.info(`■ Nako3Execute: execute`)
   		this.execNako3(uri)
    }
}

class Nako3Pack {

    private async readFromUri (uri: Uri): Promise<string|null> {
        let text: string
        const uristr = uri.toString()
        const document = workspace.textDocuments.find(d => d.uri.toString() === uristr)
        if (document) {
            text = document.getText()
        } else {
            try {
                const bytes = await workspace.fs.readFile(uri)
                text = bytes.toString()
            } catch (err) {
                // nop
                return null
            }
        }
        return text
    }
}