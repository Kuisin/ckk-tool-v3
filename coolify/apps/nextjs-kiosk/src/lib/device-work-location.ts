import { prisma } from "./db";
import { type LocalizedText, localized, workLocationLabel } from "./format";
import type { Locale } from "./i18n";
import type { BoardScope } from "./location-board-core";

/**
 * device-work-location.ts — この端末の既定作業場所（表示用）。
 *
 * 実績に記録される作業場所は **端末で決まる**（読み取った QR > 端末の既定 >
 * 記録なし。`work-location-actuals` の不変条件）。つまり作業者から見ると
 * 「いまこのタブレットで開始したら、どこで作業したことになるのか」は端末の
 * 設定次第で、しかもそれは隠し設定画面の中にあって普段は見えない。
 * ヘッダーと工程開始前の案内が同じ値を出せるように、引き方をここへ 1 本化する。
 *
 * `getDevice()` には**足さない**。あれは毎リクエストの認証経路で、表示のための
 * JOIN を持ち込む場所ではない（端末名の解決だけで足りている）。
 */
export async function getDeviceDefaultWorkLocationLabel(
  deviceId: string,
  locale: Locale,
): Promise<string | null> {
  const row = await prisma.kioskDevice.findUnique({
    where: { id: deviceId },
    select: {
      defaultWorkLocation: {
        select: { name: true, group: { select: { name: true } } },
      },
    },
  });
  return workLocationLabel(row?.defaultWorkLocation, locale);
}

/** 一覧が見ている作業場所（画面が要る分だけ）。 */
export interface BoardLocation {
  id: number;
  /** 作業場所コード（QR の KEY・unique）。 */
  code: string;
  /** 「グループ / 場所」の表示名。 */
  label: string;
  groupId: number;
  /** グループ名（「グループ全体」の選択肢に出す）。 */
  groupName: string;
}

const BOARD_LOCATION_SELECT = {
  id: true,
  code: true,
  name: true,
  groupId: true,
  group: { select: { name: true } },
} as const;

function toBoardLocation(
  row: {
    id: number;
    code: string;
    name: unknown;
    groupId: number;
    group: { name: unknown };
  },
  locale: Locale,
): BoardLocation {
  return {
    id: row.id,
    code: row.code,
    label: workLocationLabel(row, locale) ?? row.code,
    groupId: row.groupId,
    groupName: localized(row.group.name as LocalizedText | null, locale),
  };
}

/**
 * この端末の既定作業場所（一覧の初期値）。未設定は null。
 *
 * ラベルだけで足りる場所は getDeviceDefaultWorkLocationLabel を使うこと。
 * こちらは一覧が「グループ全体」へ広げたり QR と突き合わせたりするために
 * id / code / グループまで要るとき用。
 */
export async function getDeviceBoardLocation(
  deviceId: string,
  locale: Locale,
): Promise<BoardLocation | null> {
  const row = await prisma.kioskDevice.findUnique({
    where: { id: deviceId },
    select: { defaultWorkLocation: { select: BOARD_LOCATION_SELECT } },
  });
  const loc = row?.defaultWorkLocation;
  return loc ? toBoardLocation(loc, locale) : null;
}

/**
 * 作業場所コード（QR の KEY）→ 一覧が見る作業場所。無効・未知は null。
 *
 * 有効判定は step-execution.ts resolveWorkLocationByCode と同じ
 * （作業場所もグループも is_active であること）。
 */
export async function resolveBoardLocationByCode(
  code: string,
  locale: Locale,
): Promise<BoardLocation | null> {
  const row = await prisma.workLocation.findFirst({
    where: { code, isActive: true, group: { isActive: true } },
    select: BOARD_LOCATION_SELECT,
  });
  return row ? toBoardLocation(row, locale) : null;
}

/**
 * 一覧が引く作業場所 id の集合。
 *
 * グループ全体は**同じグループの有効な作業場所すべて**。グループの plant_id は
 * null（＝拠点を問わない）があり得るので、展開に拠点条件を足さない
 * — 足すと共有グループが黙って消える。
 */
export async function boardLocationIds(
  location: BoardLocation,
  scope: BoardScope,
): Promise<number[]> {
  if (scope === "location") return [location.id];
  const rows = await prisma.workLocation.findMany({
    where: { groupId: location.groupId, isActive: true },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  return ids.length > 0 ? ids : [location.id];
}
