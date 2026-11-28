import type { BoardGroup } from "@/lib/work-location-board-core";

/** 作業場所一覧 (PD09) — サーバー → クライアント。 */
export interface BoardData {
  /** 表示している日（YYYY-MM-DD・JST）。 */
  date: string;
  /** 今日を見ているか（持ち越し・作業中の行はこのときだけ出る）。 */
  isToday: boolean;
  groups: BoardGroup[];
  total: number;
}
