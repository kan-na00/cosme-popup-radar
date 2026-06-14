# 🎀 コスメ ポップアップ レーダー（東京・神奈川）

東京・神奈川エリアの **コスメ ポップアップ / 無料サンプル配布 / ミニゲーム特典** イベントを
毎日収集して、一覧・絞り込み・検索できる Web アプリです。

- 🔍 ブランド・会場・エリア・キーワードで検索
- 🏷️ エリア（東京/神奈川）・種別（ポップアップ/サンプル/ミニゲーム/プレゼント等）で絞り込み
- 🎁 「サンプル無料」「ミニゲームあり」「プレゼントあり」のこだわり条件
- 🗓️ 開催中／これから開催／終了間近で並び替え
- 🤖 毎日自動収集できるスクレイパー（アダプタ方式）を同梱

> 現在はすぐ動くように **リアルなサンプルデータ** が入っています。
> 実サイトからの自動収集は `scripts/collect.mjs` のアダプタを実装すると有効化できます。

---

## セットアップ（Mac / ローカル）

Node.js 18 以上が必要です（`node -v` で確認）。

```bash
cd "/Users/kanatsunoda/Desktop/cosme pop up"
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開くと一覧が表示されます。

---

## 毎日収集する

手動で収集を実行:

```bash
npm run collect
```

`data/events.json` が更新され、終了したイベントは自動的に除外されます。

### 毎日自動で実行する（cron 例）

毎朝 7:00 に収集を回す場合、`crontab -e` で以下を追加します（パスは環境に合わせて調整）:

```cron
0 7 * * * cd "/Users/kanatsunoda/Desktop/cosme pop up" && /usr/local/bin/node scripts/collect.mjs >> collect.log 2>&1
```

> `which node` で node の絶対パスを確認して置き換えてください。

---

## 実サイトからの収集を有効にする

`scripts/collect.mjs` の `sources` 配列に「アダプタ」を追加します。
各アダプタは `CosmeEvent[]` を返す `run()` を持ち、1つが失敗しても他は続行します。

雛形（`example: 商業施設イベントページ`）が入っているので、

1. `enabled: true` に変更
2. 対象サイトの URL と HTML セレクタ（`cheerio`）を実装

すると収集対象になります。`inferTypes` / `inferPrefecture` / `normalizeDate` などの
推論ヘルパーで、タイトルから種別・エリア・日付を自動判定できます。

### 収集元の候補

- 商業施設のイベントページ（ルミネ / マルイ / PARCO / ラゾーナ / ランドマーク 等）
- @cosme のイベント / ニュースページ
- 各ブランド公式サイトの「NEWS」「EVENT」ページ

> ⚠️ 収集する際は各サイトの利用規約・robots.txt を必ず確認し、アクセス間隔を空けてください。
> Instagram など要ログインのサービスの自動取得は規約違反になりやすいため非推奨です。

---

## データ構造

`data/events.json`:

```jsonc
{
  "updatedAt": "ISO日時",
  "events": [
    {
      "id": "一意キー",
      "title": "イベント名",
      "brand": "ブランド名",
      "types": ["popup", "free_sample", "minigame", "gift", "novelty", "workshop"],
      "prefecture": "東京 | 神奈川",
      "area": "エリア",
      "venue": "会場",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "url": "公式URL",
      "source": "出典名",
      "freeSample": true,
      "hasGift": true,
      "hasGame": true
    }
  ]
}
```

---

## 技術スタック

- Next.js 14 (App Router) + React 18 + TypeScript
- スタイルは自作 CSS（追加のUIライブラリ不要）
- 収集スクリプト: Node.js + cheerio

## 注意

掲載情報には実在しないサンプルが含まれます。お出かけ前に必ず公式情報で開催日・内容をご確認ください。
