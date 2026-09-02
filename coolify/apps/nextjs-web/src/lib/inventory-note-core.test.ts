import { describe, expect, it } from "vitest";
import {
  decodeInventoryNote,
  encodeInventoryNote,
} from "./inventory-note-core";

describe("encodeInventoryNote / decodeInventoryNote", () => {
  it("パラメータなしの往復", () => {
    const encoded = encodeInventoryNote("materialReceived");
    expect(decodeInventoryNote(encoded)).toEqual({
      key: "materialReceived",
      params: undefined,
    });
  });

  it("パラメータありの往復", () => {
    const encoded = encodeInventoryNote("workOrderCompletedFinished", {
      workOrderNumber: 123,
    });
    expect(decodeInventoryNote(encoded)).toEqual({
      key: "workOrderCompletedFinished",
      params: { workOrderNumber: 123 },
    });
  });

  it("旧形式（素の日本語文字列）は null", () => {
    expect(decodeInventoryNote("指示書 #123 完了入庫")).toBeNull();
  });

  it("null・undefined・空文字は null", () => {
    expect(decodeInventoryNote(null)).toBeNull();
    expect(decodeInventoryNote(undefined)).toBeNull();
    expect(decodeInventoryNote("")).toBeNull();
  });

  it("壊れた JSON は例外を投げず null", () => {
    expect(decodeInventoryNote("i18n:{not json")).toBeNull();
    expect(decodeInventoryNote('i18n:{"noKey":true}')).toBeNull();
  });
});
