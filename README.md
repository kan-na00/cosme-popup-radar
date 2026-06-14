# 🎀 コスメ ポップアップ レーダー（東京・神奈川）

東京・神奈川エリアの **コスメ ポップアップ / 無料サンプル配布 / ミニゲーム特典** イベントを
毎日収集して、一覧・絞り込み・検索できる Web アプリです。

- 🔍 ブランド・会場・エリア・キーワードで検索
- 🏷️ エリア（東京/神奈川）・種別（ポップアップ/サンプル/ミニゲーム/プレゼント等）で絞り込み
- 🎁 「サンプル無料」「ミニゲームあり」「プレゼントあり」のこだわり条件
- 🗓️ 開催中／これから開催／終了間近で並び替え
- 🤖 **PR TIMES のプレスリリースから実データを毎日自動収集**（アダプタ方式）

> `npm run collect` を実行すると、PR TIMES から東京・神奈川のコスメ系
> （ポップアップ / 無料サンプル / ミニゲーム / ノベルティ）イベントを収集して
> `data/events.json` を更新します。終了したイベントは自動で除外されます。

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

## 収集の仕組み（PR TIMES アダプタ）

`scripts/collect.mjs` は次の流れで動きます。

1. PR TIMES のキーワード検索（`コスメ ポップアップ` など複数）でリリース一覧を取得
2. 各リリース詳細ページを開き、本文コンテナから情報を抽出
   - タイトル / 画像（og:image）/ 企業名・公開日（og:description）
   - 開催期間（`開催期間：2026年6月20日〜7月26日` 等の表記を解析）
   - エリア・会場（本文中の地名・会場名を推定）
   - 種別（ポップアップ / サンプル / ミニゲーム / 特典 などをキーワードで推定）
3. **東京・神奈川** かつ **コスメ関連** のイベントだけに絞り込み
4. `data/events.json` にマージ（id で重複排除）、終了分は自動除外

### 精度について

プレスリリースは自由文のため、開催期間・会場・エリアの抽出は**ベストエフォート（推定）**です。
誤抽出が混ざる場合があります。表示前に公式情報での確認を推奨します。

### 収集元を追加・調整したい

`sources` 配列に独自アダプタ（`{ name, enabled, run }`）を追加できます。
キーワードは `PRTIMES_KEYWORDS`、コスメ判定は `COSME_RE`、エリア判定は
`TOKYO_AREAS` / `KANAGAWA_AREAS` で調整できます。

> ⚠️ 収集する際は対象サイトの利用規約・robots.txt を尊重し、アクセス間隔を空けています。
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
