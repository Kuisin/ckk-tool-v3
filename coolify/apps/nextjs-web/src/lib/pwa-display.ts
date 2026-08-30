/**
 * pwa-display.ts — インストールした PWA の中で動いているかの判定と、
 * 「別タブで開く」リンクの実際の開き方。
 *
 * WHY: ホーム画面に追加した PWA（standalone）には**アドレスバーも戻るボタンも
 * 無い**。だから行き先の性格で開き方を変える必要がある:
 *
 *   - **アプリの画面**（自前のヘッダーとナビゲーションを持つ）… アプリの中で
 *     開いてよい。iOS では `target="_blank"` でアプリの外（Safari）へ出て
 *     しまうので、`keepInAppOnClick` で同じウィンドウに倒す。
 *   - **文書・ファイル・外部サイト**（PDF、保管ファイル、Metabase など）…
 *     **アプリの中で開いてはいけない**。同じウィンドウに出すとブラウザ内蔵の
 *     PDF ビューアが画面を占め、戻る手段がどこにも残らない（利用者の指摘。
 *     デスクトップの PWA では戻るジェスチャーも無いので詰む）。`target="_blank"`
 *     のまま端末に任せると、Android はカスタムタブ、iOS はアプリ内ブラウザ表示、
 *     デスクトップは別ウィンドウ — いずれも閉じれば元の画面がそのまま残る。
 *
 * **既定は後者**（新しいブラウジングコンテキスト）で、アプリの画面だけが
 * `keepInApp` を明示する。逆を既定にすると、文書リンクを 1 つ足すたびに同じ
 * 行き止まりが再発する（実際 PDF ボタンがそうなっていた）。
 *
 * iOS Safari は長らく `display-mode: standalone` を報告しなかったので、
 * `navigator.standalone` も併せて見る（片方だけでは iOS を取りこぼす）。
 */

export interface DisplaySignals {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
}

/** 与えられたシグナルから standalone を判定する（テスト用に切り出した純関数）。 */
export function detectStandalone(win: DisplaySignals | undefined): boolean {
  if (!win) return false;
  if (win.navigator?.standalone === true) return true;
  try {
    return win.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    // matchMedia が無い / クエリを解釈できない環境では「普通のブラウザ」に倒す。
    return false;
  }
}

/** いまインストールした PWA の中か。SSR では常に false。 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return detectStandalone(window as unknown as DisplaySignals);
}

/**
 * `target="_blank"` のリンクに添えるクリックハンドラ。**アプリの画面へ行く
 * リンクにだけ**使う（`keepInApp` を明示した呼び出し側だけ）。
 *
 * 普通のブラウザでは**何もしない**（そのまま新しいタブが開く）。PWA の中では
 * 既定の動作を止めて同じウィンドウで開き、アプリの外へ出さない。
 */
export function keepInAppOnClick(
  event: { preventDefault: () => void },
  href: string,
): void {
  if (!isStandaloneDisplay()) return;
  event.preventDefault();
  window.location.assign(href);
}

/**
 * 実アンカーを作ってクリックする（`window.open` はポップアップ扱いで塞がれる）。
 *
 * PWA の中でも**アプリの中には留めない** — PDF などの文書がアプリの画面を
 * 置き換えてしまうと戻れなくなるため（上の WHY）。端末側のアプリ内ブラウザ /
 * 別ウィンドウで開き、閉じれば元の画面に戻る。
 */
export function openInNewContext(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
