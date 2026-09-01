/**
 * display-groups.ts — ディスプレイを**機械ごとにまとめる**（SY09 の一覧・詳細）。
 *
 * Raspberry Pi 5 は HDMI が 2 口あり、1 台で 2 枚のテレビを回せる。DB は
 * **1 枚 = 1 行**（映すものも倍率も画面ごとに決まるので、そこは分けたまま）だが、
 * 一覧に 2 行並ぶと「別々の機械が 2 台あるのか、1 台が 2 枚出しているのか」が
 * 読めない。設置場所も名前も似た行が隣り合うので、なおさら紛らわしい。
 *
 * そこで**表示だけ**まとめる: 同じ機械の画面は 1 行にし、何枚目かを選んで
 * 中身を見る。データの持ち方は変えない。
 *
 * ★ `machineId` は **Pi の自己申告**（URL に載ってくる値）で、詐称できる。
 *   だからここでの用途は**まとめ表示だけ**に留める — 認証にも権限にも使わない
 *   （_specs/tables.md の display_devices の注記どおり）。まとめ違いが起きても
 *   一覧の並びが変わるだけで、権限や表示内容には影響しない。
 *
 * 純粋な組み立てだけを持つ（DB にも React にも触らない）。
 */

/** まとめに要る最小限。画面の行そのものは呼び出し側の型で持つ。 */
export interface MachineScreen {
  id: string;
  machineId: string | null;
  screenIndex: number | null;
}

export interface MachineGroup<T extends MachineScreen> {
  /** 同じ機械の画面（screenIndex 昇順。番号なしは末尾）。 */
  screens: T[];
  /** 機械の識別子。1 枚だけの画面は null（まとめる相手が居ない）。 */
  machineId: string | null;
  /** 2 枚以上を 1 行にまとめたか。false なら従来どおりの 1 行。 */
  grouped: boolean;
}

/**
 * 画面の一覧を機械ごとにまとめる。
 *
 * - `machineId` が無い画面は**まとめない**（1 枚運用。手掛かりが無いので、
 *   同じ機械かどうか判断できない）。
 * - 同じ `machineId` が 1 枚しか無いときもまとめない（1 行のままで十分）。
 * - **元の並び順を保つ**。まとめた行は、その機械の最初の画面が居た位置に出す
 *   （並べ替えの結果が呼び出し側の指定と食い違わないように）。
 */
export function groupByMachine<T extends MachineScreen>(
  rows: T[],
): MachineGroup<T>[] {
  const byMachine = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.machineId) continue;
    const list = byMachine.get(row.machineId);
    if (list) list.push(row);
    else byMachine.set(row.machineId, [row]);
  }

  const emitted = new Set<string>();
  const groups: MachineGroup<T>[] = [];

  for (const row of rows) {
    const siblings = row.machineId ? byMachine.get(row.machineId) : undefined;
    // まとめる相手が居ない（1 枚運用 / 同じ機械が 1 枚だけ）
    if (!row.machineId || !siblings || siblings.length < 2) {
      groups.push({ screens: [row], machineId: row.machineId, grouped: false });
      continue;
    }
    if (emitted.has(row.machineId)) continue; // 2 枚目以降は先頭にまとめ済み
    emitted.add(row.machineId);
    groups.push({
      screens: [...siblings].sort(compareScreens),
      machineId: row.machineId,
      grouped: true,
    });
  }

  return groups;
}

/** 何枚目か の昇順。番号の無いものは末尾（並びが日替わりにならないよう id で決める）。 */
function compareScreens<T extends MachineScreen>(a: T, b: T): number {
  const ai = a.screenIndex ?? Number.MAX_SAFE_INTEGER;
  const bi = b.screenIndex ?? Number.MAX_SAFE_INTEGER;
  return ai !== bi ? ai - bi : a.id.localeCompare(b.id);
}

/** 選択肢に出す「何枚目」の札。番号が無いものは順番で埋める。 */
export function screenLabel(
  screen: MachineScreen,
  indexInGroup: number,
): string {
  return `${screen.screenIndex ?? indexInGroup + 1} 枚目`;
}
