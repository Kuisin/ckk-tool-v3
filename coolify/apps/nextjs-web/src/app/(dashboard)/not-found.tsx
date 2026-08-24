import { NotFoundContent } from "@/components/ui/NotFoundContent";

/**
 * ダッシュボード配下の 404。notFound() 呼び出しと未定義 URL
 * （[...not-found] キャッチオール経由）の両方でシェル内に表示される。
 */
export default function DashboardNotFound() {
  return <NotFoundContent />;
}
