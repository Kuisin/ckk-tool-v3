/**
 * instrumentation.ts — サーバー起動時フック（Next.js instrumentation）。
 *
 * 受注請書の監視フォルダポーラーを起動する。INTAKE_DIR 未設定なら何もしない
 * （ローカル・ビルド時は安全に無効）。間隔は INTAKE_POLL_MS（既定 60 秒）。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.INTAKE_DIR) return;

  const { scanIntakeFolder } = await import("./lib/intake");
  const interval = Number(process.env.INTAKE_POLL_MS ?? 60_000);

  console.log(
    `[intake] watcher started: dir=${process.env.INTAKE_DIR} every ${interval}ms`,
  );
  // 起動直後に 1 回、その後は定期実行（scan 側に再入ガードあり）
  scanIntakeFolder().catch((e) => console.error("[intake] initial scan", e));
  setInterval(() => {
    scanIntakeFolder().catch((e) => console.error("[intake] scan", e));
  }, interval);
}
