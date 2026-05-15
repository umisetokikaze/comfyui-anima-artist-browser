# Anima Artist Browser (Anima-2b)


ComfyUI 上でアーティストタグを探しながら、可変数の artist タグを 1 本の文字列として出力できるカスタムノードです。

> このノードはコミュニティ製の独立ツールです。  
> フォークやミラーではなく、別実装の ComfyUI ノードとして整理しています。  
> 元サイトへ接続したり、元サイトへリクエストを送ったりするものではありません。

---

## 概要

`Anima Artist Browser` は、必要な数だけアーティストスロットを増やし、`@artist,@artist,...` 形式の `STRING` を 1 本だけ出力するノードです。

このノード自体は **CLIP エンコードを行いません**。  
出力された文字列を必要な後段ノードへ接続して使います。

---

## インストール

1. このリポジトリをダウンロードまたは clone します
2. フォルダを以下に配置します

```text
ComfyUI/custom_nodes/
```

3. ComfyUI を再起動します

ノード名:

```text
Anima Artist Browser
```

---

## 入出力

### 入力

* `artists.artist0`, `artists.artist1`, ...
  各アーティストスロットです。必要に応じてスロットを増やせます。
* `strengths.strength0`, `strengths.strength1`, ...
  各スロットに対応するアーティスト強度です。`1.0` で等倍、変更時は重み付き形式で出力されます。

実装上は ComfyUI の可変入力を使っており、現在は最大 100 スロットまで拡張できます。

### 出力

* `artist_string`

各出力は次の形式で生成されます。

```text
@artist,@artist,@artist,...
```

強度を変更したスロットは次のように重み付きで出力されます。

```text
(@artist:1.2),@artist,(@artist:0.85)
```

空のスロットは無視され、選択済みの artist だけが左から順に連結されます。
強度が `1.0` のスロットは、従来どおり `@artist` のまま出力されます。

---

## 基本的な使い方

1. 必要に応じて artist / strength スロットを増やします
2. ブラウザやランダム選択で各 artist スロットを埋めます
3. 必要に応じて各 strength を調整します
4. 出力された `artist_string` を後段ノードへ接続します

例:

```text
Anima Artist Browser
   └─ artist_string -> downstream string input
```

---

## ノード上の操作

### Artist Browser

スタイルブラウザを開きます。  
一覧から選んだアーティストは、空いているスロットに順番に入ります。空きがない場合は現在選択中のスロットを上書きします。

カードにマウスを乗せるとその artist が選択状態になり、`Apply` / `Copy` / `Favorite` を即時操作できます。
キーボード操作にも対応しており、`/` で検索欄へ移動、矢印キーで選択移動、`Enter` で適用、`C` でコピー、`F` で favorite 切り替え、`S` で Swipe Mode、`1` から `9` でターゲットスロット切り替えができます。

gear menu から favorites の `Export`、`Import`、`Clear` も行えます。Import は現在の favorites へ merge するか、丸ごと replace するかを選べます。

### After Queue

`After Queue` を `Next Artist`、`Random Artist`、`Random No Repeat`、`Favorite Random`、`Favorite No Repeat` のいずれかにすると、Queue 実行時は現在のスロット内容で出力しつつ、送信直後に次回用の artist 構成へ更新します。

`Random Artist` は、現在スロットに入っている artist 数だけを対象にランダム更新します。未使用スロットは空のまま維持されます。

`Random No Repeat` は、現在入っている artist を次回の候補からできるだけ外して再抽選します。候補数が足りない場合だけ再利用します。

`Favorite Random` は、favorites に登録済みの artist だけを候補にしてランダム更新します。現在埋まっているスロット数だけを更新し、未使用スロットは空のまま維持されます。

`Favorite No Repeat` は、favorites 限定の `Random No Repeat` です。現在入っている favorites を次回の候補からできるだけ外して再抽選します。

`Pin Favorites` を `On` にすると、現在スロットに入っていて favorites 登録済みの artist は固定したまま、残りの枠だけを更新します。

`Toggle Slot Lock` を使うと、現在の操作対象スロットだけを queue 更新対象から外せます。manual apply やブラウザからの上書きはそのまま許可され、`After Queue` 系の自動更新だけ止まります。

### Clear Artist

現在存在している artist スロットをすべて空にします。

### スロット表示

ノード下部にスロット概要が追加され、現在どのアーティストが入っているか確認できます。  
ハイライトされている行が、現在の操作対象スロットです。`LOCK` が付いている行は per-slot lock が有効です。スロット数が多い場合は現在位置の周辺だけを表示します。

---

## 主な機能

### ビジュアルスタイルブラウザ

サムネイル付きでアーティストを一覧表示し、視覚的に選択できます。

### 検索と絞り込み

複数語の検索に加えて、`works` の最小/最大、`uniqueness` の最小/最大、favorites 限定表示で一覧を絞り込めます。

### 可変スロット管理

1 ノードで必要な数だけアーティストを保持し、1 本の artist 文字列として出力できます。

### Filled Slot Count Preservation

`Random Artist` は、現在埋まっているスロット数だけを対象に更新します。  
たとえば 2 スロットだけ埋まっている場合は、未使用スロットを勝手に増やさず 2 枠だけを再抽選します。

### Random No Repeat

`Random No Repeat` は、現在スロットに入っている artist を優先的に避けながら更新するモードです。
同じタグが連続しにくいので、探索用途での体感がかなり軽くなります。

### Favorite Random

`Favorite Random` は、favorites に登録した artist だけから再抽選したい場合のモードです。  
favorites が少ない場合は、その件数ぶんまでだけ埋まり、残りは空のままになります。

### Favorite No Repeat

`Favorite No Repeat` は、favorites の中だけで重複をできるだけ避けながら回したい場合のモードです。
favorites 数が少ない場合は、候補不足のぶんだけ既存タグを再利用します。

### お気に入り固定ランダム

favorites に登録済みで、かつ現在スロットに入っている artist を固定し、残りだけをランダム追加できます。

### Auto Cycle

アーティストを順に切り替えながらキュー実行できます。スタイル探索用です。

### スタイルデータ更新

内蔵のアーティストデータベースを手動で更新できます。

---

## フロントエンド構成

リファクタリング後の主な責務は次の通りです。

* `js/index.js`
  ComfyUI 拡張エントリポイント
* `js/queue_behavior.js`
  queue hook と after-queue 更新
* `js/node_ui.js`
  ノード widget/UI 注入
* `js/node_runtime.js`
  ノード runtime 状態と timer
* `js/browser.js`
  ブラウザ側 composition root

より詳しい責務分割は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照してください。

---

## 注意点

* このノードの出力は `STRING` です
* `KSampler` に直接つなぐことはできません
* 出力は artist タグ文字列のみで、base prompt は含みません
* 空スロットは空文字を返します
* artist / strength スロットは可変ですが、現在の実装上限は 100 です

---

## クレジット

Style explorer / dataset concept by @ThetaCursed  
https://thetacursed.github.io/Anima-Style-Explorer

このリポジトリは独立実装であり、元リポジトリのフォークやミラーとして運用しない方針です。  
データ整理、タグ付け、プレビュー参照の権利は原作者に帰属します。  
原作者から修正または削除要請があった場合は尊重します。  
元リポジトリに残す謝辞文面は [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md) にまとめています。

---

## 対応環境

* ComfyUI
* Anima 2B

---

## ライセンス

コード: MIT License

データセット: オフライン補完・ブラウズ用途でのみ同梱。権利表記は元プロジェクトに帰属します。
