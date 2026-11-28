import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { fnKey, getQueryClient } from "./query-client";

describe("関数を鍵にする", () => {
  it("同じ関数は同じ番号", () => {
    const search = async () => [];
    expect(fnKey(search)).toBe(fnKey(search));
  });

  it("違う関数は違う番号 — 別の検索のキャッシュを引かない", () => {
    const products = async () => [];
    const partners = async () => [];
    expect(fnKey(products)).not.toBe(fnKey(partners));
  });

  it("関数をそのまま鍵に入れると区別が消える（だから番号にする）", () => {
    const a = async () => [];
    const b = async () => [];
    expect(hashKey(["search", a, "x"])).toBe(hashKey(["search", b, "x"]));
    expect(hashKey(["search", fnKey(a), "x"])).not.toBe(
      hashKey(["search", fnKey(b), "x"]),
    );
  });
});

describe("QueryClient", () => {
  it("サーバー（window 無し）では呼ぶたびに別物 — 利用者間で混ぜない", () => {
    expect(getQueryClient()).not.toBe(getQueryClient());
  });

  it("タブ復帰での取り直しは既定で切ってある", () => {
    const { queries } = getQueryClient().getDefaultOptions();
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });
});
