import { getDisplay } from "@/lib/display-auth";
import { loadProductionBoard, plantNameOf } from "@/lib/display-board";
import { sortBoardEntries, toBoardEntry } from "@/lib/display-board-core";
import { ProductionBoard } from "./ProductionBoard";

/**
 * /display/content/production — 生産ボード（APP_PAGE の第 1 号）。
 *
 * DisplayRenderer がフレームに載せて呼ぶ。更新（再読込）は呼び出し側が
 * 持つので、ここは**素直なサーバーコンポーネント**でよい。
 *
 * ディスプレイの Cookie が要る — フレームの URL を直接叩かれても、
 * 登録済みの画面でなければ何も出さない。
 */

export const dynamic = "force-dynamic";

function intParam(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getDisplay();
  if (!auth.ok) {
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>
        この画面は登録されていません。
      </div>
    );
  }

  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  // 拠点は「プロファイルの指定 → 端末の所属拠点」の順。プロファイルで
  // 拠点を決めていない画面でも、その端末の拠点ぶんは自然に絞れる。
  const plantId = intParam(one("plantId")) ?? auth.display.plantId ?? null;
  const workLocationId = intParam(one("workLocationId"));

  const [rows, plantName] = await Promise.all([
    loadProductionBoard({ plantId, workLocationId }),
    plantNameOf(plantId),
  ]);

  const entries = sortBoardEntries(rows.map(toBoardEntry));

  return (
    <ProductionBoard entries={entries} plantName={plantName} title="生産状況" />
  );
}
