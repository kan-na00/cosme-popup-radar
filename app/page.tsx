import { loadEvents } from "@/lib/events";
import EventBoard from "@/components/EventBoard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { events, updatedAt } = await loadEvents();

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <h1>🎀 コスメ ポップアップ レーダー</h1>
          <p>
            東京・神奈川のコスメ ポップアップ / 無料サンプル配布 /
            ミニゲーム特典イベントを毎日収集して一覧表示。
          </p>
          <div className="hero-meta">
            <span className="hero-chip">📍 東京・神奈川</span>
            <span className="hero-chip">🗓️ 毎日更新</span>
            <span className="hero-chip">
              登録イベント {events.length} 件
            </span>
          </div>
        </div>
      </header>

      <div className="wrap">
        <EventBoard events={events} updatedAt={updatedAt} />
      </div>
    </main>
  );
}
