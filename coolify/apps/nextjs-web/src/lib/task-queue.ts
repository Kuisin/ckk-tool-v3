/**
 * task-queue.ts — 同時実行数に上限を付けた小さなジョブ列。
 *
 * 用途は注文請書の自動抽出。抽出は po-extract → ollama へ行き、ollama は
 * `OLLAMA_NUM_PARALLEL`（ai-stack では 2）までなら**同じ常駐モデルへ並行に
 * 流せる**。上限なしに投げるとモデルの奪い合いで却って遅くなるので、
 * 「空いている分だけ並列」= 上限付きの列にする。
 *
 * 依存なしの純ロジック — ワーカーと上限を渡すだけ。1 件の失敗で列は止めない
 * （1 件のために後続が全部詰まる方が困る）。
 */

export interface TaskQueue<T> {
  /** 末尾に積む。同じキーが既に列/実行中にある場合は積まない（keyOf 指定時）。 */
  push(item: T): void;
  /** 待機中の件数（実行中は含まない）。 */
  size(): number;
  /** 実行中の件数。 */
  activeCount(): number;
  /** 何か動いているか（待機 or 実行中）。 */
  isRunning(): boolean;
  /** 列が空になり実行も終わるまで待つ（テスト・シャットダウン用）。 */
  onIdle(): Promise<void>;
}

export interface TaskQueueOptions<T> {
  /** 同時に走らせる上限（既定 1 = 直列）。1 未満は 1 に丸める。 */
  concurrency?: number;
  /**
   * 重複判定のキー。指定すると、待機中または実行中の同キーは積まれない
   * （同じ書類の抽出を二重に走らせないため）。
   */
  keyOf?: (item: T) => string;
  /** ワーカーが投げたときの通知先。既定は console.error。 */
  onError?: (error: unknown, item: T) => void;
}

export function createTaskQueue<T>(
  worker: (item: T) => Promise<void>,
  options: TaskQueueOptions<T> = {},
): TaskQueue<T> {
  const { keyOf, onError } = options;
  const limit = Math.max(1, Math.floor(options.concurrency ?? 1));
  const pending: T[] = [];
  const pendingKeys = new Set<string>();
  const runningKeys = new Set<string>();
  let active = 0;
  let idleWaiters: (() => void)[] = [];

  const settleIdle = () => {
    if (active > 0 || pending.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const runOne = async (item: T): Promise<void> => {
    const key = keyOf?.(item);
    if (key !== undefined) runningKeys.add(key);
    active += 1;
    try {
      await worker(item);
    } catch (error) {
      if (onError) onError(error, item);
      else console.error("[task-queue] worker failed", error);
    } finally {
      if (key !== undefined) runningKeys.delete(key);
      active -= 1;
      // 空いた枠に次を入れる。
      pump();
      settleIdle();
    }
  };

  const pump = () => {
    while (active < limit && pending.length > 0) {
      const item = pending.shift() as T;
      const key = keyOf?.(item);
      if (key !== undefined) pendingKeys.delete(key);
      void runOne(item);
    }
  };

  return {
    push(item) {
      if (keyOf) {
        const key = keyOf(item);
        // 実行中の分も含めて重複を弾く（連打・起動時の拾い直しと重なっても安全）。
        if (pendingKeys.has(key) || runningKeys.has(key)) return;
        pendingKeys.add(key);
      }
      pending.push(item);
      // 起動は次のティック — push した側の処理を先に終わらせる。
      void Promise.resolve().then(pump);
    },
    size: () => pending.length,
    activeCount: () => active,
    isRunning: () => active > 0 || pending.length > 0,
    onIdle() {
      if (active === 0 && pending.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
  };
}
