#!/usr/bin/env node
/**
 * 毎日収集スクリプト（実データ対応・アダプタ方式）
 * --------------------------------------------------
 * 使い方:
 *   node scripts/collect.mjs
 *
 * 仕組み:
 *   - sources[] に登録した「収集元アダプタ」を順番に実行します。
 *   - 既定では PR TIMES のプレスリリースから、東京・神奈川のコスメ系
 *     （ポップアップ / 無料サンプル / ミニゲーム / ノベルティ）イベントを収集します。
 *   - 取得結果を data/events.json にマージ（id で重複排除）し、
 *     終了した（endDate が過ぎた）イベントは自動で除外します。
 *
 * 注意:
 *   - プレスリリースは自由文のため、開催期間・会場・エリアの抽出は
 *     ベストエフォート（推定）です。誤抽出が混ざる場合があります。
 *   - 対象サイトの利用規約 / robots.txt を尊重し、アクセス間隔を空けています。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "events.json");

const UA =
  "cosme-popup-radar/1.0 (+personal use; respects robots.txt) Mozilla/5.0";

/* ===================== 共通ユーティリティ ===================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeId(...parts) {
  return (
    "prt-" +
    parts
      .filter(Boolean)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9ぁ-んァ-ン一-龠ー]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
  );
}

async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
}

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'");
}

/* ===================== 抽出ロジック ===================== */

// 具体的なエリア名（都道府県の汎用語は含めない）
const KANAGAWA_AREAS = [
  "横浜",
  "川崎",
  "鎌倉",
  "みなとみらい",
  "藤沢",
  "湘南",
  "小田原",
  "厚木",
  "相模原",
  "新百合ヶ丘",
  "新百合丘",
  "たまプラーザ",
  "武蔵小杉",
  "元町",
  "中華街",
  "ラゾーナ",
];
const TOKYO_AREAS = [
  "新宿",
  "渋谷",
  "池袋",
  "銀座",
  "原宿",
  "表参道",
  "青山",
  "六本木",
  "丸の内",
  "立川",
  "町田",
  "吉祥寺",
  "上野",
  "日本橋",
  "二子玉川",
  "お台場",
  "恵比寿",
  "中目黒",
  "錦糸町",
  "北千住",
  "有楽町",
  "浅草",
  "代官山",
  "自由が丘",
  "渋谷区",
  "新宿区",
];

/**
 * 本文中で最初に出現する具体エリア名で都道府県を判定。
 * 具体名が無ければ「神奈川県/東京都」の汎用語で判定。
 */
function detectLocation(text) {
  let best = null;
  for (const w of KANAGAWA_AREAS) {
    const i = text.indexOf(w);
    if (i >= 0 && (!best || i < best.i))
      best = { i, prefecture: "神奈川", area: normalizeArea(w) };
  }
  for (const w of TOKYO_AREAS) {
    const i = text.indexOf(w);
    if (i >= 0 && (!best || i < best.i))
      best = { i, prefecture: "東京", area: normalizeArea(w) };
  }
  if (best) return { prefecture: best.prefecture, area: best.area };
  if (text.includes("神奈川")) return { prefecture: "神奈川", area: "神奈川" };
  if (text.includes("東京")) return { prefecture: "東京", area: "東京" };
  return null;
}

// 東京・神奈川以外の地名（会場に含まれていたら除外する）
const OTHER_PREF =
  /千葉|柏|船橋|幕張|さいたま|大宮|浦和|埼玉|所沢|大阪|梅田|難波|心斎橋|京都|名古屋|栄|福岡|博多|天神|札幌|仙台|神戸|三宮|広島|金沢|静岡|宇都宮|高崎|水戸/;

function normalizeArea(w) {
  if (w === "新百合丘") return "新百合ヶ丘";
  if (w === "中華街" || w === "元町") return "元町・中華街";
  if (w === "渋谷区") return "渋谷";
  if (w === "新宿区") return "新宿";
  return w;
}

const COSME_RE =
  /コスメ|化粧品|ビューティ|メイク|メイクアップ|スキンケア|フレグランス|香水|リップ|ティント|ファンデ|アイシャドウ|アイシャドー|マスカラ|チーク|アイライナー|アイブロウ|コンシーラー|美容液|化粧水|乳液|クレンジング|下地|ヘアケア|ネイル|マニキュア|ジェルネイル|基礎化粧|日焼け止め|UVケア|デパコス|韓国コスメ/;

function inferTypes(text) {
  const types = [];
  if (/サンプル|試供|サンプリング|ミニサイズ|お試し|試し塗り|タッチアップ/.test(text))
    types.push("free_sample");
  if (/ゲーム|ガチャ|ルーレット|スロット|抽選|スタンプラリー|くじ|抽せん/.test(text))
    types.push("minigame");
  if (/ノベルティ/.test(text)) types.push("novelty");
  if (/プレゼント|特典|もらえる|ギフト|来場者/.test(text)) types.push("gift");
  if (/ワークショップ|体験会|セミナー|実演|タッチアップ/.test(text))
    types.push("workshop");
  if (
    types.length === 0 ||
    /ポップアップ|pop\s?up|popup|期間限定(?:ショップ|ストア|店舗|shop)/i.test(text)
  )
    types.unshift("popup");
  return [...new Set(types)];
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** "開催期間：2026年6月20日〜7月26日" などから {startDate,endDate} を推定 */
function extractPeriod(text) {
  const rangeRe =
    /(?:開催期間|開催日時|開催日程|会期|期間|開催)[^0-9]{0,8}?(\d{4})年(\d{1,2})月(\d{1,2})日[^0-9]{0,14}?[～〜~\-－—ー]+\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/;
  const m = text.match(rangeRe);
  if (m) {
    const sy = +m[1],
      sm = +m[2],
      sd = +m[3];
    const ey = m[4] ? +m[4] : sy,
      em = +m[5],
      ed = +m[6];
    return {
      startDate: `${sy}-${pad(sm)}-${pad(sd)}`,
      endDate: `${ey}-${pad(em)}-${pad(ed)}`,
    };
  }
  const single = text.match(
    /(?:開催期間|開催日時|開催日程|会期|開催日)[^0-9]{0,8}?(\d{4})年(\d{1,2})月(\d{1,2})日/
  );
  if (single) {
    const d = `${single[1]}-${pad(+single[2])}-${pad(+single[3])}`;
    return { startDate: d, endDate: d };
  }
  return null;
}

const VENUE_STOPWORD =
  /^(?:で|でも|では|により|による|および|また|なお|その|この|当|各|※|お)/;

function cleanVenue(v) {
  let s = v
    .replace(/(開催期間|開催日時|期間|住所|日時|詳しく|TEL|https?).*$/, "")
    .replace(/[（(].*$/, "")
    .replace(/[　\s]+/g, " ")
    .trim();
  return s;
}

function extractVenue(text, area) {
  const m = text.match(
    /(?:会場|開催場所|開催店舗|開催地|場所|店舗|会場名)[：:　\s]*([^。、\n]{2,50})/
  );
  if (m) {
    const v = cleanVenue(m[1]);
    if (v.length >= 3 && !VENUE_STOPWORD.test(v) && !/場合|展開|異なる/.test(v))
      return v.slice(0, 44);
  }
  // フォールバック: エリア名＋施設語を含む箇所を探す
  const facility = text.match(
    new RegExp(
      `([^\\s。、]{0,18}(?:${area})[^\\s。、]{0,18}(?:店|館|ビル|プラザ|モール|百貨店|マルイ|PARCO|パルコ|ルミネ|タワー|ヒルズ|スクエア|SHOP|ショップ|書店))`
    )
  );
  if (facility) {
    const v = cleanVenue(facility[1]);
    if (v.length >= 3) return v.slice(0, 44);
  }
  return area;
}

/** og:description "○○のプレスリリース（2026年6月12日 12時00分）タイトル" を分解 */
function parseOgDesc(desc) {
  if (!desc) return {};
  const m = desc.match(
    /^(.*?)のプレスリリース（(\d{4})年(\d{1,2})月(\d{1,2})日/
  );
  if (!m) return {};
  return {
    company: m[1].trim(),
    publishedAt: `${m[2]}-${pad(+m[3])}-${pad(+m[4])}`,
  };
}

/* ===================== PR TIMES アダプタ ===================== */

const PRTIMES_KEYWORDS = [
  "コスメ ポップアップ",
  "化粧品 サンプル 配布",
  "コスメ ノベルティ",
  "ビューティー 体験 イベント",
];

const PER_KEYWORD = 12; // 1キーワードあたり詳細取得する上限
const TOTAL_LIMIT = 40; // 全体の詳細取得上限（負荷対策）

async function prtimesSearchUrls(keyword) {
  const url =
    "https://prtimes.jp/main/action.php?run=html&page=searchkey&search_word=" +
    encodeURIComponent(keyword);
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const found = [];
  $('a[class^="release-card_link__"]').each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el)
      .find('[class^="release-card_title__"]')
      .first()
      .text()
      .trim();
    if (href && href.includes("/main/html/rd/p/")) {
      found.push({
        url: href.startsWith("http") ? href : "https://prtimes.jp" + href,
        title,
      });
    }
  });
  return found.slice(0, PER_KEYWORD);
}

async function prtimesParseRelease(url) {
  const html = await fetchText(url);
  const title = metaContent(html, "og:title") || "";
  const image = (metaContent(html, "og:image") || "").replace(/&amp;/g, "&");
  const desc = metaContent(html, "og:description") || "";
  const { company, publishedAt } = parseOgDesc(desc);

  // 本文コンテナだけを対象にする（関連リリースや企業紹介の誤検出を防ぐ）
  const $ = cheerio.load(html);
  let body = $(".press-release-body-v3-0-0").first().text();
  body = body ? body.replace(/\s+/g, " ").trim() : stripTags(html);

  // 企業紹介の定型文（「コスメを中心に生活雑貨を販売する○○社は、」等）を除去。
  // これをしないと小売店の自己紹介に含まれる「コスメ」で誤検出してしまう。
  const announcement = body
    .replace(
      /[^。]*?(?:を(?:中心に[^。]*?)?(?:販売|製造|展開|運営|提供)|を手がける|を手掛ける)[^。]*?(?:は[、,]|は )/g,
      ""
    )
    .trim();

  // 関連性はタイトルか「告知本文の冒頭」で判定し、企業紹介での誤検出を避ける
  const lead = announcement.slice(0, 320);
  if (!COSME_RE.test(title) && !COSME_RE.test(lead)) return null;

  const loc = detectLocation(`${title} ${body}`);
  if (!loc) return null; // 東京・神奈川以外は除外

  const period = extractPeriod(body) || extractPeriod(title);
  if (!period) return null; // 開催期間が読めないものは品質確保のため除外

  const haystack = `${title} ${body}`;
  const types = inferTypes(haystack);
  // イベント性が薄いもの（ポップアップ/サンプル/ゲーム/特典いずれも無し）は除外
  const isEventLike =
    types.includes("popup") ||
    types.includes("free_sample") ||
    types.includes("minigame") ||
    types.includes("gift") ||
    types.includes("novelty");
  if (!isEventLike) return null;

  const venue = extractVenue(body, loc.area);

  // 会場が東京・神奈川以外の地名を含む場合は除外（本文に東京等が出ていても会場優先）
  if (OTHER_PREF.test(venue)) return null;

  return {
    id: makeId(title, loc.area, period.startDate),
    title: decodeEntities(title),
    brand: company,
    types,
    prefecture: loc.prefecture,
    area: loc.area,
    venue,
    startDate: period.startDate,
    endDate: period.endDate,
    url,
    image: image || undefined,
    source: "PR TIMES",
    description:
      (body.slice(0, 110).replace(/\s+/g, " ") + "…").trim() || undefined,
    freeSample: types.includes("free_sample"),
    hasGift: types.includes("gift") || types.includes("novelty"),
    hasGame: types.includes("minigame"),
    collectedAt: publishedAt
      ? new Date(publishedAt).toISOString()
      : new Date().toISOString(),
  };
}

const prtimesAdapter = {
  name: "PR TIMES (コスメ系イベント)",
  enabled: true,
  run: async () => {
    const seen = new Set();
    const candidates = [];
    for (const kw of PRTIMES_KEYWORDS) {
      try {
        const list = await prtimesSearchUrls(kw);
        for (const c of list) {
          if (!seen.has(c.url)) {
            seen.add(c.url);
            candidates.push(c);
          }
        }
        console.log(`     検索「${kw}」: ${list.length} 件`);
      } catch (e) {
        console.warn(`     検索「${kw}」失敗: ${e.message}`);
      }
      await sleep(400);
    }

    const limited = candidates.slice(0, TOTAL_LIMIT);
    console.log(`     詳細取得: ${limited.length} 件を解析します...`);
    const events = [];
    for (const c of limited) {
      try {
        const ev = await prtimesParseRelease(c.url);
        if (ev) events.push(ev);
      } catch {
        /* 個別失敗はスキップ */
      }
      await sleep(300);
    }
    return events;
  },
};

/* ===================== 収集元の登録 ===================== */

const sources = [prtimesAdapter];

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
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
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
      console.log(`  ▶️  ${src.name}`);
      const results = await src.run();
      for (const ev of results) {
        if (!byId.has(ev.id)) added++;
        byId.set(ev.id, { ...byId.get(ev.id), ...ev });
      }
      console.log(`  ✅ ${src.name}: ${results.length} 件取得`);
    } catch (err) {
      console.warn(`  ⚠️  ${src.name}: 取得失敗 (${err.message}) → スキップ`);
    }
  }

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
