function toHtml (s) {
  s = '' + s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const PluginAssist = {
  'meta': {
    type: 'const',
    value: {
      pluginName: 'plugin_assist', // プラグインの名前
      description: 'なでしこ３ highlightからの起動支援用プラグイン',
      pluginVersion: '0.1.2', // プラグインのバージョン
      nakoRuntime: ['wnako'], // 対象ランタイム
      nakoVersion: '3.6.1' // 最小要求なでしこバージョン
    }
  },
  // @プレビュー支援
  '言': { // @alertにより表示する // いう
    type: 'func',
    josi: [['と', 'を']],
    pure: true,
    asyncFn: false,
    fn: function (s, sys) {
      window.alert(s)
    },
    return_none: true
  }
}

if (typeof (navigator) === 'object' && typeof navigator.nako3 !== 'undefined') 
  {navigator.nako3.addPluginObject('PluginAssist', PluginAssist)}
