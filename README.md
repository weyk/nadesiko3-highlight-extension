# VSCode Nadesiko3 Highlight

この[Visual Studio Code](https://code.visualstudio.com/)用の拡張機能は[なでしこ３](https://nadesi.com/)の文法に順じたハイライト表示を提供します。

## 機能一覧

- 文法によるハイライト表示(Semantic syntax highlight)
- 単語のハイライト表示(document highlight)
- アウトラインの表示(Document symbols)
- ホバーヒントの表示(Hover)
- 定義へ移動(Definition)
- 全ての参照を検索(Reference)
- シンボルの名前変更(Rename)
- 色の定数名と色を表す文字列に色アイコンを表示(Document Color)
- シェバングのあるsnako/cnako3のファイルを実行する
- ローカルファイルの取り込みが無いwnako3のファイルを実行する

## インストール

VSCodeの「管理」から「拡張機能」を開き、**`nadesiko3 syntax highlight`** を探してインストールする。

## 設定
- ### Enable Nako3 From Remote
  ハイライト表示のためにリモートにあるnako3ファイルを取り込む。
- ### Enable Plugin From Remote
  ハイライト表示のためにリモートにあるjs形式のファイルを取り込む。
- ### Max Number Of Problems
  問題タブに表示する表示する最大の問題/警告の数(１ファイル毎)
- ### Nadesiko3 > Folder
  なでしこ３をインストールしたフォルダーを指定する。  
  ワークスペースの./node_modules/nadesiko3が存在しない場合に使用する。  
  標準的なプラグインの取り込みや実行時のランタイムとして使用する。
- ### Node > Node Bin
  NodeJSの実行ファイル(node又はnode.exe)のフルパスを指定する。  
  実行する際のランタイムとして使用する。
- ### Runtime Mode
  シェバング行が無く使用しているプラグインや命令からランタイム環境の判別が付かない場合にここで設定したランタイム環境としてハイライト表示を行う。  
  実行しようとしている場合にランタイム環境の判別が付かない場合はここの設定は参照せず実行を中止する。
- ### Runtime Use Shebang
  ランタイム環境の判別の際に先頭行がシェバング行ならばその設定値を判別に用いる。
- ### Trace
  拡張機能開発時のログの出力レベルを選択する。  
  拡張機能を利用している環境では開発ツールを表示しない限り関係しない。

## ライセンス

[MITライセンス](LICENSE.txt)
