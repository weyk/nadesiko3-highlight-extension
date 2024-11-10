(window => {
  const NAKO_SCRIPT_RE = /^(なでしこ|nako|nadesiko)3?$/
  // 追加のデフォルトコード
  const defCode =
    '『#turtle_cv』へ描画開始。'

  let displayId_info = 'nako3highlight_info'
  let displayId_err = 'nako3highlight_err'

  // なでしこの関数をカスタマイズ
  /*navigator.nako3.addFunc('表示', [['と', 'を']], function (s) {
    console.log(s)
    document.getElementById(displayId).innerHTML += toHtml(s) + '<br>'
  }, true)
  */
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
  
  // 簡易DOMアクセス関数など
  async function run () {
    document.getElementById(displayId_info).innerHTML = ''
    const logger = navigator.nako3.getLogger()
    logger.addListener('stdout', (logData) => {
      if (logData.level === 'stdout') {
        console.log(logData.browserConsole)
        document.getElementById(displayId_info).innerHTML += logData.html + '<br>'
      }
    })
    logger.addListener('info', (logData) => {
      if (['warn', 'error'].includes(logData.level)) {
        console.log(logData.browserConsole)
        document.getElementById(displayId_err).innerHTML += logData.html + '<br>'
        document.getElementById(displayId_err).style.display = 'block'
      }
    })
    try {
      console.log('defCode=', defCode)
      await runNakoScript(defCode)
      document.getElementById(displayId_err).style.display = 'none'
    } catch (e) {
      document.getElementById(displayId_err).innerHTML = e.message.replace(/\n/g, '<br>\n')
      document.getElementById(displayId_err).style.display = 'block'
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
