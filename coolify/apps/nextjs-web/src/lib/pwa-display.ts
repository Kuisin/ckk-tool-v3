/**
 * pwa-display.ts — インストールした PWA の中で動いているかの判定と、
 * 「新しいタブで開く」の実際の振る舞い。
 *
 * WHY: ホーム画面に追加した PWA で `target="_blank"` を踏むと、**iOS では
 * Safari が起動してアプリの外へ出てしまう**（インストールした意味が薄れる）。
 * Android は同じ指定でもアプリ内のブラウザビューに留まるので、プラットフォーム
 * ごとに結果が割れる。ここで判定を 1 か所に集め、standalone なら**アプリの中で
 * 開く**（同じウィンドウ）に倒して、どの端末でも同じ結末にする。
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
 * `target="_blank"` のリンクに添えるクリックハンドラ。
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
 * PWA の中ならアプリ内で開く。
 */
export function openInNewTab(href: string): void {
  if (isStandaloneDisplay()) {
    window.location.assign(href);
    return;
  }
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
