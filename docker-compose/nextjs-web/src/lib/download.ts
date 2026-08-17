/**
 * download.ts — ファイル保存（ブラウザ側）。
 *
 * `downloadFile(url, filename)` は 1 つの入口で 2 つの経路を使い分ける:
 *
 *   - モバイル/タブレット（`pointer: coarse`）で Web Share API がファイル共有に
 *     対応している場合 … 実体を fetch して `navigator.share({ files })` を呼ぶ。
 *     iOS/Android では OS の共有シートが開き、「ファイルに保存」「AirDrop」
 *     「メールで送信」など保存先をユーザーが選べる（=「どこに保存するか聞く」）。
 *   - それ以外（デスクトップ、共有非対応、共有失敗） … `<a download>` で
 *     通常のダウンロード。ブラウザの既定ダウンロード先に保存される。
 *
 * 共有シートをユーザーが閉じた場合（AbortError）は何もしない。共有が
 * 権限エラー等で失敗したときは取得済みの Blob をそのまま通常ダウンロード
 * に回すので、再取得は発生しない。
 *
 * 認証は same-origin cookie（fetch の既定）に依存する。URL は同一オリジンの
 * API ルート（/api/pdf/... 等）を前提とする。
 */

/** 共有シート経路を使うべき端末か（指で操作する端末 + ファイル共有対応）。 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse && typeof navigator.share === "function";
}

/** `<a download>` でダウンロードさせる（blob URL は使用後に解放）。 */
function saveViaAnchor(href: string, filename: string, isObjectUrl = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (isObjectUrl) {
    // 即 revoke するとダウンロード開始前に無効化される端末があるため遅延。
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}

/**
 * ファイルを保存する。モバイルでは OS の共有シート（保存先を選べる）、
 * それ以外は通常のダウンロード。
 */
export async function downloadFile(
  url: string,
  filename: string,
): Promise<void> {
  if (!canShareFiles()) {
    saveViaAnchor(url, filename);
    return;
  }

  let file: File;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    file = new File([blob], filename, {
      type: blob.type || "application/octet-stream",
    });
  } catch {
    // 取得に失敗したら通常ダウンロードに任せる（ブラウザ側でエラー表示）。
    saveViaAnchor(url, filename);
    return;
  }

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (err) {
    // ユーザーが共有シートを閉じただけなら保存は不要。
    if (err instanceof DOMException && err.name === "AbortError") return;
    // それ以外（NotAllowedError 等）は通常ダウンロードにフォールバック。
  }

  saveViaAnchor(URL.createObjectURL(file), filename, true);
}
