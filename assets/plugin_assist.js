function toHtml (s) {
  s = '' + s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const PluginAssist = {
  // @プレビュー支援
/*  '表示': { // @特定の要素(id=output_info)の中に追記する // ひょうじ
    type: 'func',
    josi: [['と', 'を']],
    pure: true,
    asyncFn: false,
    fn: function (s, sys) {
      console.log(s)
      document.getElementById('nako3highlight_info').innerHTML += toHtml(s) + '<br>'
    },
    return_none: true
  },*/
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
