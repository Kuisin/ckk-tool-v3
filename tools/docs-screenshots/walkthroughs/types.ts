/**
 * types.ts — 業務の通し操作（ウォークスルー）の型。
 *
 * 1 本 = マニュアルのプロセス編 1 ページぶんの操作を、最初から最後まで実際に
 * 画面で行うもの。**同じ 1 本を 2 通りに走らせる**:
 *
 *   check  … 待ち時間なしで走らせ、途中で止まれば落ちる（CI。本番へ上げる前の検査）
 *   record … 人が目で追える速さで走らせ、動画・字幕・章立てを書き出す（マニュアル用）
 *
 * 動画は検査そのものの録画なので、「動画では動くのに実際は壊れている」も
 * 「検査は通るのに動画が古い手順」も起きない。モードを知っているのは walk.ts だけで、
 * 各ウォークスルーは操作の内容だけを書く。
 */

import type { Walk } from "./walk";

/**
 * ログインするデモユーザー。storageState は global-setup.ts が作る。
 *   staff    … 担当者（demo2）。書類を作り、承認を依頼する側。承認グループには居ない
 *   approver … 承認者（demo_shot）。デモの全承認グループのメンバー
 *   admin    … 管理者（demo1）。システム設定の画面用
 */
export type WalkUser = "staff" | "approver" | "admin";

export interface WalkStep {
  /**
   * この手順の説明。動画の字幕と章の見出しになる（日本語。利用者に見える文言なので
   * 用語は `_specs/i18n-glossary.md` に従う）。
   */
  caption: string;
  run: (w: Walk) => Promise<void>;
}

export interface Walkthrough {
  /** 動画のファイル名（拡張子なし）。マニュアルからの参照キー。 */
  id: string;
  /** この動画を載せるマニュアルページ（lint の参照チェック対象）。 */
  docPage: string;
  /** 動画の題。プレーヤーの見出しに出る。 */
  title: string;
  /** 最初にログインしているユーザー。既定 staff（demo2）。 */
  user?: WalkUser;
  steps: WalkStep[];
}

/** 録画 1 本ぶんの記録。スクリプト（scripts/walkthroughs.ts）が manifest.json に束ねる。 */
export interface RecordedVideo {
  id: string;
  docPage: string;
  title: string;
  durationSec: number;
  /** 章 = 手順。startSec は動画の先頭からの秒。 */
  chapters: { title: string; startSec: number }[];
}

/** 配信用ディレクトリの manifest.json。nextjs-web の lib/manual-videos.ts が読む。 */
export interface VideoManifest {
  /** 録画したときのコミット（分からなければ null）。 */
  commit: string | null;
  /** 録画した時刻（ISO 8601・オフセット付き）。 */
  recordedAt: string;
  videos: RecordedVideo[];
}
