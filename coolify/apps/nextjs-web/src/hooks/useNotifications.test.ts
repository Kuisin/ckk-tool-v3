import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nextReconnectDelay,
  shouldReopenAfterError,
  subscribeToSignal,
} from "./useNotifications";

// EventSource.readyState の実値（DOM 無しの node 環境で回すため定数で持つ）。
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

describe("SSE の再接続判定", () => {
  it("CLOSED はブラウザが諦めた状態 — 自前で開き直す", () => {
    // デプロイ中の 502 / セッション切れの 307 → HTML がここに来る。
    // これを拾い損ねるとベルは以後フォールバック取得まで沈黙する。
    expect(shouldReopenAfterError(CLOSED)).toBe(true);
  });

  it("CONNECTING はブラウザが再試行中 — 二重に開かない", () => {
    expect(shouldReopenAfterError(CONNECTING)).toBe(false);
  });

  it("OPEN では開き直さない", () => {
    expect(shouldReopenAfterError(OPEN)).toBe(false);
  });
});

describe("再接続バックオフ", () => {
  it("倍々に伸びる", () => {
    expect(nextReconnectDelay(1_000)).toBe(2_000);
    expect(nextReconnectDelay(2_000)).toBe(4_000);
  });

  it("上限 30 秒で頭打ち（落ちっぱなしでも叩き続けない）", () => {
    expect(nextReconnectDelay(30_000)).toBe(30_000);
    expect(nextReconnectDelay(600_000)).toBe(30_000);
  });

  it("1 秒から始めて 30 秒に達するまで有限回で収束する", () => {
    let delay = 1_000;
    let steps = 0;
    while (delay < 30_000 && steps < 100) {
      delay = nextReconnectDelay(delay);
      steps++;
    }
    expect(delay).toBe(30_000);
    expect(steps).toBeLessThan(10);
  });
});

// ─── 再接続の実挙動 ─────────────────────────────────────────────────────────
//
// 判定関数だけ試しても「配線し忘れ」は捕まらない。ここは EventSource と
// document を最小限に差し替えて、購読 → 接続が死ぬ → 開き直る、までを通す。
// jsdom は使わない（vitest は node 環境のまま）。

type Listener = () => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static reset() {
    FakeEventSource.instances = [];
  }
  static get latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1);
    if (!last) throw new Error("EventSource が 1 つも作られていない");
    return last;
  }

  /** 0 CONNECTING / 1 OPEN / 2 CLOSED */
  readyState = 0;
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  private emit(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }

  /** 接続確立 → サーバーが ready を送った。 */
  open() {
    this.readyState = 1;
    this.emit("ready");
  }
  /** 通知イベントが届いた。 */
  push() {
    this.emit("notification");
  }
  /** 転送が切れた — ブラウザが自分で繋ぎ直す。 */
  dropTransiently() {
    this.readyState = 0;
    this.emit("error");
  }
  /** 200 以外の応答（502 / ログインへの 307）— ブラウザは諦める。 */
  failPermanently() {
    this.readyState = 2;
    this.emit("error");
  }
}

const originalEventSource = globalThis.EventSource;
const originalDocument = globalThis.document;

/**
 * 購読は必ずここを通す。共有ストリームはモジュール変数なので、テストが
 * 途中で失敗して解除し損ねると次のテストへ漏れて連鎖的に落ちる
 * （最初にこのテストを書いたとき実際に起きた）。afterEach で必ず畳む。
 */
const openSubscriptions: (() => void)[] = [];
function subscribe(handler: () => void = () => {}): () => void {
  const unsubscribe = subscribeToSignal(handler);
  openSubscriptions.push(unsubscribe);
  return unsubscribe;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.reset();
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
  (globalThis as { document?: unknown }).document = {
    visibilityState: "visible",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
});

afterEach(() => {
  // 解除は冪等（Set.delete + 購読者 0 で畳む）なので二重呼び出しも安全。
  while (openSubscriptions.length > 0) openSubscriptions.pop()?.();
  vi.useRealTimers();
  (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe("SSE の再接続（配線）", () => {
  it("恒久的な失敗のあと、待って自前で開き直す", () => {
    const unsubscribe = subscribe();
    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.latest.open();

    // デプロイ中の 502 相当。ブラウザは CLOSED にして諦める。
    FakeEventSource.latest.failPermanently();
    expect(FakeEventSource.instances).toHaveLength(1); // まだ待ち時間中

    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(2); // 開き直した

    unsubscribe();
  });

  it("開き直した接続が合図を配れる（＝購読者が生きたまま繋がる）", () => {
    const seen: string[] = [];
    const unsubscribe = subscribe(() => seen.push("signal"));
    FakeEventSource.latest.open();
    expect(seen).toHaveLength(1); // ready で 1 回

    FakeEventSource.latest.failPermanently();
    vi.advanceTimersByTime(1_000);
    FakeEventSource.latest.open(); // 新しい接続の ready

    expect(seen).toHaveLength(2);
    FakeEventSource.latest.push();
    expect(seen).toHaveLength(3);

    unsubscribe();
  });

  it("転送切れはブラウザ任せ — 二重に開かない", () => {
    const unsubscribe = subscribe();
    FakeEventSource.latest.open();

    FakeEventSource.latest.dropTransiently();
    vi.advanceTimersByTime(60_000);

    expect(FakeEventSource.instances).toHaveLength(1);
    unsubscribe();
  });

  it("失敗が続くと待ち時間が伸びる（叩き続けない）", () => {
    const unsubscribe = subscribe();
    FakeEventSource.latest.open();

    FakeEventSource.latest.failPermanently();
    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    // 2 回目は 2 秒待つ — 1 秒では開かない。
    FakeEventSource.latest.failPermanently();
    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(3);

    unsubscribe();
  });

  it("一度つながればバックオフは 1 秒に戻る", () => {
    const unsubscribe = subscribe();
    FakeEventSource.latest.open();
    FakeEventSource.latest.failPermanently();
    vi.advanceTimersByTime(1_000);
    FakeEventSource.latest.open(); // 復活 → リセット
    FakeEventSource.latest.failPermanently();

    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(3);
    unsubscribe();
  });

  it("最後の購読者が消えたら接続を閉じ、以後は開き直さない", () => {
    const unsubscribe = subscribe();
    const source = FakeEventSource.latest;
    source.open();

    unsubscribe();
    expect(source.closed).toBe(true);

    // 畳んだ後に遅れて error が来ても復活させない。
    source.failPermanently();
    vi.advanceTimersByTime(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("購読者が居る間は 1 タブ 1 接続を共有する", () => {
    const a = subscribe();
    const b = subscribe();
    expect(FakeEventSource.instances).toHaveLength(1);

    // 片方が抜けても残りが居る限り繋いだまま。
    a();
    expect(FakeEventSource.latest.closed).toBe(false);
    b();
    expect(FakeEventSource.latest.closed).toBe(true);
  });
});
