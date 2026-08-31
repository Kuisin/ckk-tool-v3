/**
 * portal-mail-core.ts — ポータルのメール送信可否と宛先マスク（純関数）。
 *
 * dev の DB には実在の取引先データが入っている。ここが無いと、検証中に
 * 本物の顧客へ確認コードが飛ぶ。
 */

/**
 * 送ってよい宛先か。
 *
 * 許可リストの書式はカンマ区切りで、次の 2 つを受ける:
 *   - アドレス全体   `taro@example.co.jp`
 *   - ドメイン       `@example.co.jp` / `example.co.jp`
 *
 * **未設定なら送らない**（`shared-token.ts` の「env 未設定 ⇒ 機能 OFF、
 * 開けっ放しにしない」と同じ家風）。
 */
export function isMailAllowlisted(
  to: string,
  allowlist: string | undefined | null,
): boolean {
  const target = to.trim().toLowerCase();
  if (!target) return false;
  const entries = (allowlist ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return false;

  const at = target.lastIndexOf("@");
  const domain = at >= 0 ? target.slice(at + 1) : "";

  return entries.some((entry) => {
    if (entry.includes("@") && !entry.startsWith("@")) return entry === target;
    const d = entry.startsWith("@") ? entry.slice(1) : entry;
    return d.length > 0 && domain === d;
  });
}

/**
 * 宛先のヒント表示（`k***@e***.co.jp`）。
 *
 * VERIFY リンクで「どこへ送るか」を示すために出す。**完全なアドレスは
 * 出さない** — リンクを拾った第三者に、誰宛のものかを教えないため。
 */
export function maskEmail(email: string): string {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = (s: string) => (s.length > 0 ? `${s[0]}***` : "***");
  const parts = domain.split(".");
  if (parts.length < 2) return `${head(local)}@${head(domain)}`;
  // 最後のラベル（.co.jp の jp、.com の com）は残す — 見当をつける役に立ち、
  // かつそれ自体は識別情報にならない。
  const tld = parts.slice(-1)[0];
  const rest = parts.slice(0, -1).map(head).join(".");
  return `${head(local)}@${rest}.${tld}`;
}
