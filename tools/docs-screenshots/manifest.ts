/**
 * manifest.ts — スクリーンショットの単一の真実源。
 *
 * 各エントリが 1 枚の PNG（content/manual/assets/screenshots/<id>.png）になる。
 * マニュアル側は frontmatter `screenshots: [<id>]` + 本文の相対画像参照で使う
 * （両者は scripts/lint-screenshots.ts が manifest と突き合わせて検証する）。
 *
 * 決定性の注意:
 *  - 「今日」が見える画面（日付ピッカー既定値・当月見出し等）は clip で外すか
 *    mask に入れる。シード由来の固定日付データは問題ない。
 *  - 撮り直しの diff 判定は docs:verify（pixelmatch, 閾値 0.1%）。
 */

import type { Page } from "@playwright/test";

export interface Shot {
  /** PNG ファイル名（拡張子なし）。マニュアルからの参照キー。 */
  id: string;
  /** この画像を使うマニュアルページ（lint の参照チェック対象、記録用）。 */
  docPage: string;
  /** 遷移先パス。 */
  path: string;
  /** ログアウト状態で撮る（storageState を使わない）。 */
  loggedOut?: boolean;
  /** ページ到達後の操作（モーダルを開く・フォームに入力する等）。 */
  steps?: (page: Page) => Promise<void>;
  /** CSS セレクタ — 指定時はその要素だけを撮る。 */
  clip?: string;
  /** ページ全体（スクロール分含む）を撮る。 */
  fullPage?: boolean;
  /** 撮影時に塗りつぶす揮発領域（時計・相対時刻など）。 */
  mask?: string[];
}

export const shots: Shot[] = [
  {
    id: "login-01",
    docPage: "start",
    path: "/login",
    loggedOut: true,
    steps: async (page) => {
      await page
        .getByRole("button", { name: "開発用アカウントでログイン" })
        .click();
      // Collapse 展開後のフォームが出るまで待つ
      await page.getByLabel("ユーザー名").waitFor();
    },
  },
  {
    id: "home-01",
    docPage: "start",
    path: "/",
    steps: async (page) => {
      await page.getByText("お気に入り").or(page.getByText("販売")).first().waitFor();
    },
  },
  {
    id: "quote-list-01",
    docPage: "apps/quote/user",
    path: "/sales/quotes",
  },
];
