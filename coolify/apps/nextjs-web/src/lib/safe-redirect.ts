/**
 * safe-redirect.ts — ログイン後に戻る先を安全な**アプリ内のパス**に畳む。
 *
 * WHY: 戻り先は URL のクエリ（callbackUrl）で運ばれるので、**利用者が書き換え
 * られる入力**そのもの。素直に飛ばすと、`?callbackUrl=https://evil.example/…`
 * を仕込んだログイン URL を配るだけで、自社ドメインのログイン画面を踏み台に
 * 任意の外部サイトへ飛ばせてしまう（オープンリダイレクト）。ログイン直後は
 * 利用者が最も警戒を解いている瞬間なので、偽サイトへの誘導が効きやすい。
 *
 * 方針は「オリジンを一切信じない」— 絶対 URL が来ても**パスだけ**を取り出し、
 * 必ず自分のオリジンへ戻す。判定を増やすより、外へ出る経路を構造的に無くす。
 */

const FALLBACK = "/";

/** ブラウザによって `\` は `/` と解釈される（`/\evil.com` = `//evil.com`）。 */
const BACKSLASH = /\\/g;
/** `scheme:` で始まる = 絶対 URL。 */
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 戻り先として使ってよいパスを返す。使えない入力はすべて `/` に倒す。
 *
 * - 絶対 URL・プロトコル相対 URL は**パス部分だけ**を採る（外へは出さない）
 * - `/login` へは戻さない（ログイン直後にログイン画面へ戻る輪を作らない）
 */
export function safeCallbackPath(
  raw: string | null | undefined,
  fallback: string = FALLBACK,
): string {
  if (typeof raw !== "string") return fallback;
  let candidate = raw.trim();
  if (!candidate) return fallback;

  if (HAS_SCHEME.test(candidate) || candidate.startsWith("//")) {
    try {
      // base は捨てる — 欲しいのはパスだけ。
      const url = new URL(candidate, "http://localhost");
      candidate = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  candidate = candidate.replace(BACKSLASH, "/");

  // ここまで来て `/` 始まりでなければ、素性の分からない相対パス。
  if (!candidate.startsWith("/")) return fallback;
  // `//host` はプロトコル相対＝他オリジン。
  if (candidate.startsWith("//")) return fallback;

  const path = candidate.split(/[?#]/)[0];
  if (path === "/login" || path.startsWith("/login/")) return fallback;

  return candidate;
}
