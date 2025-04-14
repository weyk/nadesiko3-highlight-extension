## 0.2.6
- バンドルする命令情報ファイル(command.json)をなでしこ3.7.3に更新。
- 範囲選択した状態でのタブキーによるインデントの動作を修正。

## 0.2.5
- 定数宣言への代入の際の修正に対応。
- トレースログの取得の際にフィルタリングできる仕組みを追加。
- 依存パッケージのバージョンを更新。

## 0.2.4
- バンドルする命令情報ファイル(command.json)をなでしこ3.6.41に更新。
- 配列記法に続く配列へのアクセスの構文に対応。
- オブジェクト記法に続く配列へのアクセスの構文に対応。
- 実装の無い機能(呼び出し履歴)が起動可能になっていたのを無効化。
- [README.md](README.md)及び[CHANGELOG.md](CHANGELOG.md)(0.2.4以降)を日本語による記述に変更。

## 0.2.3
- Support analyze code in template string.
- Add color icon for user declare constant.
- Add color icon for color-code-like string.
- Support document color edit.
- Modify guess runtime logic.
- Fix incorrect analize word after edit unclosed function.

## 0.2.2
- Allow import js/nako3 from remote https site when execute wnako3.

## 0.2.1
- Modify document highlight(same variable, statement set)
- No analize source code unless change.
- No reload js-plugin unless update.
- Fix semantic indent logic.

## 0.2.0
- Add document color support(no editable)
- Can launch wnako file(no local import)
- Update bundled command.json(3.6.67)

## 0.1.1
- Delete "useParser" option, always use.

## 0.1.0
- Add go to Definition support.
- Add find all references support.
- Add hover hint for expr operator.
- Use inernal parser.
- Support import js-plugin.
- Support import nako3 file.
- Update bundled command.json 

## 0.0.9
- Add auto detect runtimeEnv from using plugin.
- Can launch dirty file.
- Update bundled command.json 

## 0.0.8
- Add auto detect runtimeEnv from shebang line.
- Add launch cnako3/snako command. require shebang.

## 0.0.7
- Add hover hint for built-in plugin instruction.
- Add localize for ja.
- Add configuration.

## 0.0.6
- Fix range of multi line string.
- Add document symbol of anonymous function.

## 0.0.5
- Add document symbol support. 

## 0.0.4
- Add configuration for surroundingPairs and autoClosingPairs.

## 0.0.3
- Add tokenize function parameter.

## 0.0.2
- Fix extension name in README.md

## 0.0.1
- Add `nadesiko3` for highlight.
