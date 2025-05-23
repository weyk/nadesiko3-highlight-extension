import { Nako3TokenTypeReserve } from './nako3token.mjs'
/** 予約語 */
const reserved: Map<string, Nako3TokenTypeReserve> = new Map([
  ['もし', 'もし'],
  ['ならば', 'ならば'],
  ['回', '回'],
  ['回繰返', '回'], // (#924)
  ['間', '間'],
  ['間繰返', '間'], // (#927)
  ['繰返', '繰返'],
  ['増繰返', '増繰返'], // (#1140)
  ['減繰返', '減繰返'],
  ['後判定', '後判定'], // (#1147)
  ['反復', '反復'],
  ['抜', '抜ける'],
  ['続', '続ける'],
  ['戻', '戻る'],
  ['先', '先に'],
  ['次', '次に'],
  ['代入', '代入'],
  ['実行速度優先', '実行速度優先'],
  ['パフォーマンスモニタ適用', 'パフォーマンスモニタ適用'], // (#986)
  ['定', '定める'],
  ['逐次実行', '逐次実行'], // 廃止 #1611 ただし念のため残しておく
  ['条件分岐', '条件分岐'],
  ['増', '増'],
  ['減', '減'],
  ['変数', '変数'],
  ['定数', '定数'],
  ['エラー監視', 'エラー監視'], // 例外処理:エラーならばと対
  ['エラーならば', 'エラーならば'],
  ['エラー', 'エラー'],
  ['それ', 'word'],
  ['そう', 'word'], // 「それ」のエイリアス
  ['関数', 'def_func'], // 無名関数の定義用
  ['インデント構文', 'インデント構文'], // https://nadesi.com/v3/doc/go.php?949
  ['非同期モード', '非同期モード'], // (#637)
  ['DNCLモード', 'DNCLモード'], // (#1140)
  ['DNCL2モード', 'DNCL2モード'],
  ['モード設定', 'モード設定'], // (#1020)
  ['取込', '取込'],
  ['モジュール公開既定値', 'モジュール公開既定値'],
  ['厳チェック', '厳チェック'] // 厳しくチェック (#1698)
])
export default reserved
