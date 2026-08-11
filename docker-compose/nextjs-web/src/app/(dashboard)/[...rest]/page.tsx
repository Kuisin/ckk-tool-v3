import { notFound } from "next/navigation";

/**
 * キャッチオール — どのルートにも一致しない URL をダッシュボードの
 * not-found（シェル内のエラーページ）へ流す。静的ルートが常に優先される
 * ため、既存ページには影響しない。
 */
export default function CatchAllNotFound() {
  notFound();
}
