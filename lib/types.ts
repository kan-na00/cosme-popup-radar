export type EventType =
  | "popup"
  | "free_sample"
  | "minigame"
  | "gift"
  | "workshop"
  | "novelty";

export type Prefecture = "東京" | "神奈川";

export interface CosmeEvent {
  /** タイトル・会場・開催日から生成した一意キー */
  id: string;
  title: string;
  brand?: string;
  /** イベントの特徴（複数可） */
  types: EventType[];
  prefecture: Prefecture;
  /** エリア（例: 新宿 / 横浜みなとみらい） */
  area: string;
  venue: string;
  address?: string;
  /** 開催開始日 YYYY-MM-DD */
  startDate: string;
  /** 開催終了日 YYYY-MM-DD */
  endDate: string;
  url?: string;
  /** 取得元の名称（@cosme / 伊勢丹 など） */
  source: string;
  description?: string;
  tags?: string[];
  /** 無料サンプル配布があるか */
  freeSample?: boolean;
  /** ノベルティ/プレゼントがもらえるか */
  hasGift?: boolean;
  /** ミニゲーム等の体験があるか */
  hasGame?: boolean;
  /** このレコードを収集した日時 ISO */
  collectedAt: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  popup: "ポップアップ",
  free_sample: "無料サンプル",
  minigame: "ミニゲーム",
  gift: "プレゼント",
  workshop: "ワークショップ",
  novelty: "ノベルティ",
};

export const EVENT_TYPE_EMOJI: Record<EventType, string> = {
  popup: "🛍️",
  free_sample: "🎁",
  minigame: "🎯",
  gift: "🎀",
  workshop: "🧪",
  novelty: "✨",
};
