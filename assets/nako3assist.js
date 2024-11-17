(window => {
  const NAKO_SCRIPT_RE = /^(なでしこ|nako|nadesiko)3?$/
  const NAKO_INIT_SCRIPT_RE = /^(なでしこ|nako|nadesiko)3?init$/
  
  const vscode = acquireVsCodeApi()

  const displayId_info = 'nako3highlight_info'
  const displayId_err = 'nako3highlight_err'
  const displayId_exception = 'nako3highlight_exception'
  
  /**
   * ブラウザでtype="なでしこ"というスクリプトを得て実行する
   */
  async function runNakoScript (defCode) {
    // スクリプトタグの中身を得る
    let nakoScriptCount = 0
    const scripts = document.querySelectorAll('script')
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]
      if (script.type.match(NAKO_SCRIPT_RE)) {
        nakoScriptCount++
        // URLからスクリプト名を見つける
        const url = (typeof (window.location) === 'object') ? window.location.href : 'url_unknown'
        const fname = `${url}#script${nakoScriptCount}.nako3`
        const code = defCode + script.text
        // 依存するライブラリをロード
        await navigator.nako3.loadDependencies(code, fname)
        // プログラムを実行
        await navigator.nako3.runAsync(code, fname, defCode)
      }
    }
    if (nakoScriptCount > 1) {
      console.log('実行したなでしこの個数=', nakoScriptCount)
    }
  }
  
  /**
   * ブラウザでtype="nako3init"というスクリプトを得て文字列で返す
   */
  function getNako3initScript (defCode) {
    let code = ''
    // スクリプトタグの中身を得る
    const scripts = document.querySelectorAll('script')
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]
      if (script.type.match(NAKO_INIT_SCRIPT_RE)) {
        code += script.text + "\n"
      }
    }
    return code
  }
  
  // 簡易DOMアクセス関数など
  async function run () {
    document.getElementById(displayId_info).innerHTML = ''
    const logger = navigator.nako3.getLogger()
    navigator.nako3.setFunc('ログ出力', [['に'], ['と', 'を']], function (l, s) {
      if (!['stdout','error','warn','info','debug','trace'].includes(l)) { return }
      const f = navigator.nako3.logger[l]
      if (f) {
        navigator.nako3.logger[l](s)
      } else {
        console.error(`level is valid, but function undefined`)        
      }
    })
    logger.addListener('stdout', (logData) => {
      if (logData.level === 'stdout') {
        try {
          vscode.postMessage({
            command: 'log.stdout',
            level: logData.level,
            data: logData
          })
        } catch (err) {

        }
        const e = document.getElementById(displayId_info)
        e.innerHTML += logData.html
      }
    })
    logger.addListener('info', (logData) => {
      if (['info', 'warn', 'error'].includes(logData.level)) {
        try {
          vscode.postMessage({
            command: 'log.info',
            level: logData.level,
            data: logData
          })
        } catch (err) {

        }
        const e = document.getElementById(displayId_err)
        e.innerHTML += logData.html
        e.classList.remove('hidden')
      }
    })
    const defCode = getNako3initScript()
    const e = document.getElementById(displayId_exception)
    try {
      console.log('defCode=', defCode)
      await runNakoScript(defCode)
      e.classList.add('hidden')
      e.innerText = ''
    } catch (err) {
      let msg
      if (err.message) {
        msg = err.message
      } else {
        msg = err
      }
      e.innerHTML = msg.replace(/\n/g, '<br>\n')
      e.classList.remove('hidden')
    }
  }

  function fullLoaded() {
    // nop
  }
  function DOMLoaded() {
    run()
  }
  if(document.readyState === "complete") {
    // Fully loaded!
    fullLoaded()
  } else if(document.readyState === "interactive") {
    // DOM ready! Images, frames, and other subresources are still downloading.
    DOMLoaded()
  } else {
    // Loading still in progress.
    // To wait for it to complete, add "DOMContentLoaded" or "load" listeners.

    window.addEventListener("DOMContentLoaded", () => {
      // DOM ready! Images, frames, and other subresources are still downloading.
      DOMLoaded()
    })

    window.addEventListener("load", () => {
      // Fully loaded!
      fullLoaded()
    })
  }
})(window)
