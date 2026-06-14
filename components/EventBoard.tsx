"use client";

import { useMemo, useState } from "react";
import type { CosmeEvent, EventType, Prefecture } from "@/lib/types";
import { EVENT_TYPE_EMOJI, EVENT_TYPE_LABELS } from "@/lib/types";

type StatusFilter = "all" | "ongoing" | "upcoming";
type SortKey = "soon" | "newest" | "ending";

const TYPE_ORDER: EventType[] = [
  "popup",
  "free_sample",
  "minigame",
  "gift",
  "novelty",
  "workshop",
];

const PREFS: Prefecture[] = ["東京", "神奈川"];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmt(s: string): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function todayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

type Status = "ongoing" | "upcoming" | "ended";

function getStatus(e: CosmeEvent, today: Date): Status {
  const start = parseDate(e.startDate);
  const end = parseDate(e.endDate);
  if (today < start) return "upcoming";
  if (today > end) return "ended";
  return "ongoing";
}

const STATUS_LABEL: Record<Status, string> = {
  ongoing: "開催中",
  upcoming: "開催予定",
  ended: "終了",
};

export default function EventBoard({
  events,
  updatedAt,
}: {
  events: CosmeEvent[];
  updatedAt: string;
}) {
  const [today] = useState(todayStart);
  const [query, setQuery] = useState("");
  const [pref, setPref] = useState<Prefecture | "all">("all");
  const [types, setTypes] = useState<Set<EventType>>(new Set());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [onlySample, setOnlySample] = useState(false);
  const [onlyGift, setOnlyGift] = useState(false);
  const [onlyGame, setOnlyGame] = useState(false);
  const [sort, setSort] = useState<SortKey>("soon");

  function toggleType(t: EventType) {
    setTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  function reset() {
    setQuery("");
    setPref("all");
    setTypes(new Set());
    setStatus("all");
    setOnlySample(false);
    setOnlyGift(false);
    setOnlyGame(false);
    setSort("soon");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((e) => {
      if (pref !== "all" && e.prefecture !== pref) return false;
      if (types.size > 0 && !e.types.some((t) => types.has(t))) return false;
      if (onlySample && !e.freeSample) return false;
      if (onlyGift && !e.hasGift) return false;
      if (onlyGame && !e.hasGame) return false;

      const st = getStatus(e, today);
      if (status === "ongoing" && st !== "ongoing") return false;
      if (status === "upcoming" && st !== "upcoming") return false;
      if (status === "all" && st === "ended") return false;

      if (q) {
        const hay = [
          e.title,
          e.brand,
          e.venue,
          e.area,
          e.description,
          ...(e.tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "newest") {
        return b.collectedAt.localeCompare(a.collectedAt);
      }
      if (sort === "ending") {
        return a.endDate.localeCompare(b.endDate);
      }
      return a.startDate.localeCompare(b.startDate);
    });
    return list;
  }, [events, query, pref, types, status, onlySample, onlyGift, onlyGame, sort, today]);

  return (
    <>
      <section className="panel">
        <input
          className="search"
          type="text"
          placeholder="🔍 ブランド・会場・エリア・キーワードで検索（例: rom&nd / 横浜 / ガチャ）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="filter-row">
          <div className="filter-group">
            <span className="filter-label">エリア</span>
            <div className="chips">
              <button
                className={`chip ${pref === "all" ? "active" : ""}`}
                onClick={() => setPref("all")}
              >
                すべて
              </button>
              {PREFS.map((p) => (
                <button
                  key={p}
                  className={`chip ${pref === p ? "active" : ""}`}
                  onClick={() => setPref(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">イベント種別</span>
            <div className="chips">
              {TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  className={`chip ${types.has(t) ? "active" : ""}`}
                  onClick={() => toggleType(t)}
                >
                  {EVENT_TYPE_EMOJI[t]} {EVENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">開催状況</span>
            <div className="chips">
              {(
                [
                  ["all", "開催中＋予定"],
                  ["ongoing", "開催中のみ"],
                  ["upcoming", "これから"],
                ] as [StatusFilter, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={`chip ${status === v ? "active" : ""}`}
                  onClick={() => setStatus(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="toggle-row">
          <span className="filter-label">こだわり条件</span>
          <button
            className={`chip ${onlySample ? "active" : ""}`}
            onClick={() => setOnlySample((v) => !v)}
          >
            🎁 サンプル無料配布あり
          </button>
          <button
            className={`chip ${onlyGame ? "active" : ""}`}
            onClick={() => setOnlyGame((v) => !v)}
          >
            🎯 ミニゲームあり
          </button>
          <button
            className={`chip ${onlyGift ? "active" : ""}`}
            onClick={() => setOnlyGift((v) => !v)}
          >
            🎀 プレゼント/ノベルティあり
          </button>
        </div>
      </section>

      <div className="toolbar">
        <span className="count">
          <strong>{filtered.length}</strong> 件のイベント
        </span>
        <div className="sort">
          <label>
            並び替え:{" "}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="soon">開催日が近い順</option>
              <option value="ending">終了が近い順</option>
              <option value="newest">新着順</option>
            </select>
          </label>{" "}
          <button className="reset" onClick={reset}>
            条件をリセット
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">🫧</div>
          <p>条件に合うイベントが見つかりませんでした。</p>
          <button className="reset" onClick={reset}>
            条件をリセットする
          </button>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((e) => {
            const st = getStatus(e, today);
            return (
              <article className="card" key={e.id}>
                <div className="card-top">
                  <span className="pref">📍 {e.prefecture}・{e.area}</span>
                  <span className={`status ${st}`}>{STATUS_LABEL[st]}</span>
                </div>

                {e.brand && <span className="brand">{e.brand}</span>}
                <h3>{e.title}</h3>

                <p className="venue">
                  <span className="pin">🏬</span>
                  {e.venue}
                </p>
                <p className="dates">
                  🗓️ {fmt(e.startDate)} 〜 {fmt(e.endDate)}
                </p>

                {e.description && <p className="desc">{e.description}</p>}

                <div className="badges">
                  {e.freeSample && (
                    <span className="badge sample">🎁 サンプル無料</span>
                  )}
                  {e.hasGame && (
                    <span className="badge game">🎯 ミニゲーム</span>
                  )}
                  {e.hasGift && (
                    <span className="badge gift">🎀 プレゼント</span>
                  )}
                  {e.types
                    .filter((t) => !["free_sample", "minigame"].includes(t))
                    .map((t) => (
                      <span className="badge" key={t}>
                        {EVENT_TYPE_EMOJI[t]} {EVENT_TYPE_LABELS[t]}
                      </span>
                    ))}
                </div>

                {e.tags && e.tags.length > 0 && (
                  <div className="tags">
                    {e.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="card-foot">
                  {e.url && (
                    <a
                      className="link"
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      詳細・公式情報を見る →
                    </a>
                  )}
                  <div className="source">出典: {e.source}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="footer">
        最終更新: {new Date(updatedAt).toLocaleString("ja-JP")}
        <br />
        ※ サンプルデータを含みます。お出かけ前に必ず公式情報で開催日・内容をご確認ください。
      </footer>
    </>
  );
}
