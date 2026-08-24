import { describe, expect, it } from "vitest";
import { MAX_RECENTS, pushRecent, readRecents } from "./recents";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("recents", () => {
  it("empty when nothing stored / storage unavailable", () => {
    expect(readRecents("product", memoryStorage())).toEqual([]);
    expect(readRecents("product", null)).toEqual([]);
  });

  it("push puts the newest first and persists", () => {
    const s = memoryStorage();
    pushRecent("product", { value: "a", label: "A" }, s);
    pushRecent("product", { value: "b", label: "B" }, s);
    expect(readRecents("product", s)).toEqual([
      { value: "b", label: "B" },
      { value: "a", label: "A" },
    ]);
  });

  it("re-selecting moves the item to the front without duplicating", () => {
    const s = memoryStorage();
    pushRecent("product", { value: "a", label: "A" }, s);
    pushRecent("product", { value: "b", label: "B" }, s);
    pushRecent("product", { value: "a", label: "A2" }, s);
    expect(readRecents("product", s)).toEqual([
      { value: "a", label: "A2" },
      { value: "b", label: "B" },
    ]);
  });

  it(`caps at ${MAX_RECENTS}`, () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_RECENTS + 3; i++) {
      pushRecent("product", { value: `v${i}`, label: `L${i}` }, s);
    }
    const rows = readRecents("product", s);
    expect(rows).toHaveLength(MAX_RECENTS);
    expect(rows[0].value).toBe(`v${MAX_RECENTS + 2}`);
  });

  it("keys are isolated", () => {
    const s = memoryStorage();
    pushRecent("product", { value: "p", label: "P" }, s);
    pushRecent("customer", { value: "c", label: "C" }, s);
    expect(readRecents("product", s)).toEqual([{ value: "p", label: "P" }]);
    expect(readRecents("customer", s)).toEqual([{ value: "c", label: "C" }]);
  });

  it("tolerates corrupted json and wrong shapes", () => {
    const s = memoryStorage({
      "ckk:recents:bad": "not json",
      "ckk:recents:shape": JSON.stringify([
        { value: 1 },
        { value: "ok", label: "OK" },
      ]),
    });
    expect(readRecents("bad", s)).toEqual([]);
    expect(readRecents("shape", s)).toEqual([{ value: "ok", label: "OK" }]);
  });
});
