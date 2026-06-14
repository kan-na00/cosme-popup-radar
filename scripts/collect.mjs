#!/usr/bin/env node
/**
 * 毎日収集スクリプト（アダプタ方式）
 * --------------------------------------------------
 * 使い方:
 *   node scripts/collect.mjs
 *
 * 仕組み:
 *   - sources[] に登録した「収集元アダプタ」を順番に実行します。
 *   - 各アダプタは CosmeEvent[] を返します。取得に失敗しても他は続行します。
 *   - 取得結果を data/events.json にマージ（重複は id で排除）し、
 *     終了した（endDate が過ぎた）イベントは自動で除外します。
 *
 * 実サイトから収集したい場合:
 *   - 下部の「実サイト用アダプタの例」を参考に parse 関数を実装してください。
 *   - HTML パースには cheerio を使えます（import 済み）。
 *   - サイトの利用規約 / robots.txt を必ず確認し、過度なアクセスは避けてください。
 *   - Instagram など要ログインの収集は規約違反になりやすいので非推奨です。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "events.json");

/** ユーティリティ: 文字列からid生成 */
function makeId(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龠ー]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** ユーティリティ: HTTP取得（タイムアウト付き） */
async function fetchHtml(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "cosme-popup-radar/1.0 (personal use; respects robots.txt)",
        "Accept-Language": "ja,en;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/* =====================================================================
 * 収集元アダプタの登録
 * 各アダプタ: { name, enabled, run: async () => CosmeEvent[] }
 * ===================================================================== */

const sources = [
  {
    name: "seed (サンプルデータ維持)",
    enabled: true,
    // 既存の seed-* データを残すためのダミー（実データ追加時もサンプルは保持）
    run: async () => [],
  },

  /* -------------------------------------------------------------------
   * 実サイト用アダプタの例（雛形）。
   * enabled: true にし、セレクタを対象サイトに合わせて実装してください。
   * ----------------------------------------------------------------- */
  {
    name: "example: 商業施設イベントページ",
    enabled: false,
    run: async () => {
      const url = "https://example.com/events";
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const events = [];

      // ▼ 対象サイトのHTML構造に合わせて書き換える
      $(".event-item").each((_, el) => {
        const title = $(el).find(".title").text().trim();
        const venue = $(el).find(".venue").text().trim();
        const period = $(el).find(".period").text().trim(); // 例: "2026/06/14〜2026/06/21"
        const link = $(el).find("a").attr("href") || url;

        const [startRaw, endRaw] = period.split(/[〜~\-]/).map((s) => s.trim());
        const startDate = normalizeDate(startRaw);
        const endDate = normalizeDate(endRaw) || startDate;
        if (!title || !startDate) return;

        events.push({
          id: makeId("ex", title, venue, startDate),
          title,
          types: inferTypes(title),
          prefecture: inferPrefecture(venue) ?? "東京",
          area: venue.slice(0, 12),
          venue,
          startDate,
          endDate,
          url: link.startsWith("http") ? link : new URL(link, url).href,
          source: "商業施設イベントページ",
          freeSample: /サンプル|試供|配布/.test(title),
          hasGift: /ノベルティ|プレゼント|特典|もらえる/.test(title),
          hasGame: /ゲーム|ガチャ|ルーレット|抽選|スタンプ/.test(title),
          collectedAt: new Date().toISOString(),
        });
      });
      return events;
    },
  },
];

/* ===================== 推論ヘルパー ===================== */

function inferPrefecture(text = "") {
  if (/神奈川|横浜|川崎|鎌倉|みなとみらい|藤沢|湘南/.test(text)) return "神奈川";
  if (/東京|新宿|渋谷|池袋|銀座|原宿|表参道|立川|町田|吉祥寺/.test(text))
    return "東京";
  return null;
}

function inferTypes(text = "") {
  const types = [];
  if (/サンプル|試供|配布/.test(text)) types.push("free_sample");
  if (/ゲーム|ガチャ|ルーレット|スロット|抽選|スタンプ/.test(text))
    types.push("minigame");
  if (/ノベルティ/.test(text)) types.push("novelty");
  if (/プレゼント|特典|もらえる|ギフト/.test(text)) types.push("gift");
  if (/ワークショップ|体験会|実演/.test(text)) types.push("workshop");
  if (types.length === 0 || /pop\s?up|ポップアップ|popup/i.test(text))
    types.unshift("popup");
  return [...new Set(types)];
}

function normalizeDate(raw = "") {
  const m = raw.match(/(\d{4})[./年-]\s*(\d{1,2})[./月-]\s*(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ===================== メイン処理 ===================== */

async function readExisting() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { updatedAt: new Date().toISOString(), events: [] };
  }
}

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

async function main() {
  console.log("🔎 コスメイベント収集を開始します...");
  const existing = await readExisting();
  const byId = new Map(existing.events.map((e) => [e.id, e]));

  let added = 0;
  for (const src of sources) {
    if (!src.enabled) {
      console.log(`  ⏭️  ${src.name} (無効)`);
      continue;
    }
    try {
      const results = await src.run();
      for (const ev of results) {
        if (!byId.has(ev.id)) added++;
        // 既存を新データで上書き（最新の情報を優先）
        byId.set(ev.id, { ...byId.get(ev.id), ...ev });
      }
      console.log(`  ✅ ${src.name}: ${results.length} 件取得`);
    } catch (err) {
      console.warn(`  ⚠️  ${src.name}: 取得失敗 (${err.message}) → スキップ`);
    }
  }

  // 終了済みイベントを除外
  const today = todayStr();
  const events = [...byId.values()]
    .filter((e) => e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const out = { updatedAt: new Date().toISOString(), events };
  await fs.writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log(
    `\n💾 保存完了: 新規 ${added} 件 / 合計 ${events.length} 件 (終了分は除外)`
  );
  console.log(`   → ${path.relative(ROOT, DATA_PATH)}`);
}

main().catch((e) => {
  console.error("収集処理でエラー:", e);
  process.exit(1);
});
