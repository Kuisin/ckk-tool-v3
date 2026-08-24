import { describe, expect, it } from "vitest";
import {
  decodeRealtimeEvent,
  encodeRealtimeEvent,
  REALTIME_MAX_PAYLOAD_BYTES,
  type RealtimeEvent,
} from "./realtime-events";

const event: RealtimeEvent = {
  kind: "notification",
  userId: "11111111-2222-3333-4444-555555555555",
};

describe("realtime イベントの符号化", () => {
  it("符号化 → 復号で元に戻る", () => {
    expect(decodeRealtimeEvent(encodeRealtimeEvent(event))).toEqual(event);
  });

  it("合図だけなので pg_notify の上限に遠く及ばない", () => {
    // 上限は 8000 バイト。本文を載せない設計が守られている限りここは通る。
    const bytes = Buffer.byteLength(encodeRealtimeEvent(event), "utf8");
    expect(bytes).toBeLessThan(REALTIME_MAX_PAYLOAD_BYTES / 10);
  });

  it("本文を載せようとした場合の歯止めが効く", () => {
    const oversized = {
      kind: "notification",
      userId: "x".repeat(REALTIME_MAX_PAYLOAD_BYTES),
    } as RealtimeEvent;
    expect(() => encodeRealtimeEvent(oversized)).toThrow(/大きすぎます/);
  });
});

describe("realtime イベントの復号（不正入力）", () => {
  // 壊れた合図でストリームを落とさない — すべて null にして無視させる。
  it.each([
    ["undefined", undefined],
    ["空文字", ""],
    ["JSON ではない", "not json"],
    ["配列", "[]"],
    ["null", "null"],
    ["kind が未知", '{"kind":"unknown","userId":"u1"}'],
    ["kind が無い", '{"userId":"u1"}'],
    ["userId が無い", '{"kind":"notification"}'],
    ["userId が空", '{"kind":"notification","userId":""}'],
    ["userId が文字列でない", '{"kind":"notification","userId":42}'],
  ])("%s は null", (_label, raw) => {
    expect(decodeRealtimeEvent(raw as string | undefined)).toBeNull();
  });

  it("余計なキーは落として正規化する", () => {
    const decoded = decodeRealtimeEvent(
      '{"kind":"notification","userId":"u1","title":"秘密"}',
    );
    expect(decoded).toEqual({ kind: "notification", userId: "u1" });
  });
});
