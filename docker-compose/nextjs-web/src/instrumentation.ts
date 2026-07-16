/**
 * instrumentation.ts — サーバー起動時フック（Next.js instrumentation）。
 *
 * 受注請書の監視フォルダポーラーを起動する。INTAKE_DIR 未設定なら何もしない
 * （ローカル・ビルド時は安全に無効）。間隔は INTAKE_POLL_MS（既定 60 秒）。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 締日処理の日次オートラン（CLOSING_AUTORUN=1 のとき JST 06 時台に 1 回）
  const { maybeRunDailyClosing } = await import("./lib/closing");
  const closingTimer = setInterval(
    () => {
      maybeRunDailyClosing().catch((e) => console.error("[closing] tick", e));
    },
    10 * 60_000, // 10 分間隔で時刻判定（実行は 1 日 1 回）
  );
  process.on("SIGTERM", () => clearInterval(closingTimer));

  if (!process.env.INTAKE_DIR) return;

  const { scanIntakeFolder } = await import("./lib/intake");
  const interval = Number(process.env.INTAKE_POLL_MS ?? 60_000);

  console.log(
    `[intake] watcher started: dir=${process.env.INTAKE_DIR} every ${interval}ms`,
  );
  // 起動直後に 1 回、その後は定期実行（scan 側に再入ガードあり）
  scanIntakeFolder().catch((e) => console.error("[intake] initial scan", e));
  const timer = setInterval(() => {
    scanIntakeFolder().catch((e) => console.error("[intake] scan", e));
  }, interval);
  // ローリングデプロイ時の graceful shutdown — 新規スキャンを止める
  // （処理中の 1 件は .processing のまま残り、次コンテナの孤児回収が拾う）
  process.on("SIGTERM", () => {
    clearInterval(timer);
    console.log("[intake] watcher stopped (SIGTERM)");
  });
}
