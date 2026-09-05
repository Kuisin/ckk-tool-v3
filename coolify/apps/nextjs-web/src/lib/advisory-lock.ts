/**
 * advisory-lock.ts — 定期処理を「同時に 1 プロセスだけ」に絞る。server-only.
 *
 * `instrumentation.ts` の setInterval で回している 3 つ（締日オートラン・通知
 * メールの掃き出し・注文書取込フォルダのスキャン）は、**プロセス内**の再入
 * ガードしか持っていなかった（`lastAutorunDate` / `running` / `scanning`）。
 * それで足りるのは 1 コンテナのときだけで、**Coolify のローリングデプロイ中は
 * 新旧 2 つのコンテナが同時に走る**。そこで起きるのは:
 *
 *   - 締日オートラン … 同じ締めが 2 回走る（`runClosingBatch` は既存行を見て
 *     更新するが、2 本が同時に読むと両方が「無い」と判断して二重に作る）
 *   - 通知メールの掃き出し … 同じ通知が 2 通飛ぶ
 *   - 取込フォルダのスキャン … rename のクレームで大半は弾けるが、番号の
 *     採り直しや孤児回収の競合が残る
 *
 * ★ **専用の接続を 1 本張る。Prisma のプールを使ってはいけない。**
 * `pg_try_advisory_lock` はセッション（＝接続）に紐づくのに、Prisma は
 * トランザクション外のクエリを**プールの空いている接続**へ投げる。ロックを
 * 取った接続と `pg_advisory_unlock` を撃つ接続が別になり得るので、解放に
 * 失敗してロックが残り、その後の全ティックが永久に飛ばされる。
 * `prisma.$transaction` で接続を固定する手もあるが、そうすると**ティック全体が
 * 1 つの DB トランザクションの中**に入ってしまう（数分かかる掃き出しを
 * idle-in-transaction で抱える + 途中失敗が全部巻き戻る）ので採らない。
 *
 * 接続を張り切りにする副産物として、**プロセスが落ちてもロックは残らない** —
 * 接続が切れた時点で PostgreSQL が解放する。だから「前回の異常終了で詰まった」
 * を人が直す手順が要らない（期限つきリース行を自前で持つとそれが要る）。
 */

import "server-only";

/**
 * 名前空間。`pg_advisory_lock(int, int)` の第 1 引数で、他用途の advisory lock
 * （設計図の版採番 = design-files.ts）と衝突しないための定数。
 */
export const PERIODIC_LOCK_NS = 0x0c_c0_01;

/** 定期処理のロック名。**増やすときはここに足す**（文字列直書きをしない）。 */
export const PERIODIC_LOCKS = {
  /** 締日処理の日次オートラン（closing.ts）。 */
  closingAutorun: "closing:autorun",
  /** 通知メールのダイジェスト掃き出し（notification-digest.ts）。 */
  notificationDigest: "notification:digest",
  /** 注文書取込フォルダのスキャン（intake.ts）。 */
  intakeScan: "intake:scan",
} as const;

export type PeriodicLockName =
  (typeof PERIODIC_LOCKS)[keyof typeof PERIODIC_LOCKS];

/**
 * ロック名 → 32bit 符号付き整数（FNV-1a）。
 *
 * DB の `hashtext()` ではなくこちらで決めるのは、**同じ名前が常に同じ鍵になる
 * ことをテストで固定したい**ため（`hashtext` は PostgreSQL の内部実装で、
 * 版が上がれば値が変わりうる）。衝突しても実害は「無関係な 2 つの定期処理が
 * 互いを待つ」だけだが、名前は上の 3 つしかないので実際には起きない。
 */
export function advisoryLockKey(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    // FNV prime 16777619 を 32bit で掛ける（オーバーフローを避ける形）。
    hash = Math.imul(hash, 0x01000193);
  }
  // int4 に収める（`| 0` で符号付き 32bit へ）。
  return hash | 0;
}

export interface AdvisoryLockOutcome<T> {
  /** ロックを取れて fn を実行したか。false = 別プロセスが走っていたので飛ばした。 */
  ran: boolean;
  /** fn の戻り値（`ran` が false なら undefined）。 */
  result?: T;
}

/**
 * ロックが取れたときだけ `fn` を走らせる。取れなければ**黙って飛ばす**
 * （次のティックで取り直す — 定期処理なので待つ意味が無い）。
 *
 * `DATABASE_URL` が無い環境（ローカル・ビルド時）では素通しで `fn` を走らせる。
 * そこは元々 1 プロセスしか無く、ロックのために動かなくなるほうが困る。
 */
export async function withAdvisoryLock<T>(
  name: PeriodicLockName,
  fn: () => Promise<T>,
): Promise<AdvisoryLockOutcome<T>> {
  const connectionString = process.env.DATABASE_URL;
  // 単一プロセス前提の環境。ロックを取らずに走らせる。
  if (!connectionString) return { ran: true, result: await fn() };

  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  // 拾わないと未処理例外でプロセスが落ちる（realtime.ts と同じ理由）。
  client.on("error", (e) => {
    console.error(`[lock] ${name} 接続エラー:`, e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  });

  let locked = false;
  try {
    await client.connect();
    const res = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS locked",
      [PERIODIC_LOCK_NS, advisoryLockKey(name)],
    );
    locked = res.rows[0]?.locked === true;
  } catch (e) {
    // ロックが取れない = 走らせない。DB が落ちていればどのみち何もできないし、
    // ここで走らせると「二重実行を防ぐ」という目的そのものを裏切る。
    console.error(`[lock] ${name} のロックを取得できませんでした:`, e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    await client.end().catch(() => {});
    return { ran: false };
  }

  if (!locked) {
    // 別のコンテナが同じティックを走らせている。ログは出さない
    // （ローリングデプロイのたびに毎ティック出ると雑音になる）。
    await client.end().catch(() => {});
    return { ran: false };
  }

  try {
    return { ran: true, result: await fn() };
  } finally {
    // end() だけでも PostgreSQL 側は解放するが、明示しておく（接続の切断が
    // 遅れてもロックが残らない）。
    await client
      .query("SELECT pg_advisory_unlock($1::int, $2::int)", [
        PERIODIC_LOCK_NS,
        advisoryLockKey(name),
      ])
      .catch(() => {});
    await client.end().catch(() => {});
  }
}
