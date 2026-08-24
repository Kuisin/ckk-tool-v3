import { describe, expect, it, vi } from "vitest";
import { createTaskQueue } from "./task-queue";

/**
 * 抽出キューの不変条件。ここが崩れると po-extract / ollama へ上限を超えて
 * 投げてしまい（ai-stack の OLLAMA_NUM_PARALLEL=2）、かえって遅くなる。
 */

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("createTaskQueue", () => {
  it("既定では 1 件ずつ（直列）", async () => {
    let concurrent = 0;
    let peak = 0;
    const queue = createTaskQueue<number>(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await tick();
      concurrent -= 1;
    });
    for (const n of [1, 2, 3, 4, 5]) queue.push(n);
    await queue.onIdle();
    expect(peak).toBe(1);
  });

  it("concurrency の分だけ並行に走らせる", async () => {
    let concurrent = 0;
    let peak = 0;
    const queue = createTaskQueue<number>(
      async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await tick(5);
        concurrent -= 1;
      },
      { concurrency: 2 },
    );
    for (const n of [1, 2, 3, 4, 5, 6]) queue.push(n);
    await queue.onIdle();
    expect(peak).toBe(2);
  });

  it("上限を超えては走らせない（並列でも枠は守る）", async () => {
    let concurrent = 0;
    let peak = 0;
    const queue = createTaskQueue<number>(
      async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await tick(3);
        concurrent -= 1;
      },
      { concurrency: 3 },
    );
    for (let n = 0; n < 20; n += 1) queue.push(n);
    await queue.onIdle();
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("concurrency 0 以下は 1 に丸める", async () => {
    let peak = 0;
    let concurrent = 0;
    const queue = createTaskQueue<number>(
      async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await tick();
        concurrent -= 1;
      },
      { concurrency: 0 },
    );
    queue.push(1);
    queue.push(2);
    await queue.onIdle();
    expect(peak).toBe(1);
  });

  it("直列のときは積んだ順に処理する", async () => {
    const done: string[] = [];
    const queue = createTaskQueue<string>(async (item) => {
      await tick();
      done.push(item);
    });
    for (const s of ["a", "b", "c"]) queue.push(s);
    await queue.onIdle();
    expect(done).toEqual(["a", "b", "c"]);
  });

  it("1 件失敗しても後続を止めない", async () => {
    const done: number[] = [];
    const onError = vi.fn();
    const queue = createTaskQueue<number>(
      async (n) => {
        if (n === 2) throw new Error("boom");
        done.push(n);
      },
      { onError },
    );
    for (const n of [1, 2, 3]) queue.push(n);
    await queue.onIdle();
    expect(done).toEqual([1, 3]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keyOf を渡すと待機中・実行中の同キーは積まれない", async () => {
    const seen: string[] = [];
    const queue = createTaskQueue<{ id: string }>(
      async (item) => {
        await tick();
        seen.push(item.id);
      },
      { keyOf: (i) => i.id },
    );
    queue.push({ id: "x" });
    queue.push({ id: "y" });
    queue.push({ id: "y" }); // 重複
    queue.push({ id: "x" }); // 重複
    await queue.onIdle();
    expect(seen.sort()).toEqual(["x", "y"]);
  });

  it("処理が終わった後は同じキーをまた積める", async () => {
    const seen: string[] = [];
    const queue = createTaskQueue<{ id: string }>(
      async (item) => {
        seen.push(item.id);
      },
      { keyOf: (i) => i.id },
    );
    queue.push({ id: "x" });
    await queue.onIdle();
    queue.push({ id: "x" });
    await queue.onIdle();
    expect(seen).toEqual(["x", "x"]);
  });

  it("空のときの onIdle は即座に解決する", async () => {
    const queue = createTaskQueue<number>(async () => {});
    await expect(queue.onIdle()).resolves.toBeUndefined();
    expect(queue.size()).toBe(0);
    expect(queue.activeCount()).toBe(0);
    expect(queue.isRunning()).toBe(false);
  });

  it("実行中に積んだ分も同じ列で捌く", async () => {
    const seen: number[] = [];
    const queue = createTaskQueue<number>(async (n) => {
      await tick();
      seen.push(n);
      if (n === 1) queue.push(3);
    });
    queue.push(1);
    queue.push(2);
    await queue.onIdle();
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});
