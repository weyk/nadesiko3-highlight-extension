interface StatementHint {
    cmd: string[]
    hint: string
}

export const statementCommand = new Map<string, StatementHint>([
  ['戻る', { cmd: ['戻る'], hint: 'ユーザ定義関数から戻る。XXで戻るとすることでユーザ関数の返値を指定する。' }],
  ['抜ける', { cmd: ['抜ける'], hint: 'ループ構文の内側でのみ使用可能。現在のループ処理を中止してループを抜けてその次の命令の処理に移る' }],
  ['続ける', { cmd: ['続ける'], hint: 'ループ構文の内側でのみ使用可能。現在のループ処理を中止して次のループ処理を開始する' }],
  ['もし',  { cmd: ['もし/ならば/違えば/ここまで'], hint: '二分岐構文。もしに指定した条件式が真ならば、ブロックAを実行し、偽ならばブロックBを実行する。\n```\nもし条件式ならば\n　ブロックA\n違えば\n　ブロックB\nここまで\n```\n'}],
  ['条件分岐', { cmd: ['条件分岐/ならば/違えば/ここまで'], hint: '多分岐構文。分岐条件に指定した値によって、個々の分岐を実行する。いずれにも一致しない場合は違えばのブロックを実行する。違えばのブロックは省略可能で、記述する場合は最後の分岐である必要がある'}],
  ['繰返', { cmd: ['繰り返す/ここまで'], hint: 'ループ構文。開始と終了の値を指定してその回数分繰り返す簡易構文。『対象』に現在の値が入る'}],
  ['回', { cmd: ['回/ここまで', '回繰り返す/ここまで'], hint: 'ループ構文。ループ回数のみ指定してループする簡易構文。『回数』にループ回数が入る'}],
  ['間', { cmd: ['間/ここまで', '間繰り返す/ここまで'], hint: 'ループ構文。条件式が真となる間ループする。'}],
  ['反復', { cmd: ['反復/ここまで'], hint: 'ループ構文。列挙可能な変数(配列やMap)についてその内容を順に繰り返す。『対象』に現在の要素が入る'}],
  ['後判定', { cmd: ['ここからA!==B'], hint: 'ループ構文。間構文とほぼ同じ。脱出判定の前に最初のループが行われる点が異なる'}],
  ['エラー監視', { cmd: ['エラー監視/エラーならば/ここまで'], hint: '例外構文。ブロックAを実行中に実行時エラーが発生した際にブロックBを実行する。実行時エラーが発生しなければブロックBは実行しない\n```\nエラー監視\n　ブロックA\nエラーならば\n　ブロックB\nここまで\n```'}],
  ['パフォーマンスモニタ適用', { cmd: ['パフォーマンスモニタ適用/ここまで'], hint: '支援機能。範囲内に対して呼び出し回数や実行時間を計測する'}],
  ['実行速度優先', { cmd: ['実行速度優先/ここまで'], hint: '支援機能。範囲内に対して指定した機能を除くことで実行速度を上げる。'}]
])
