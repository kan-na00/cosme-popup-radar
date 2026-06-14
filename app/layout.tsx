import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "コスメ ポップアップ レーダー | 東京・神奈川",
  description:
    "東京・神奈川のコスメ ポップアップ・無料サンプル配布・ミニゲーム特典イベントを毎日収集して一覧表示。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
