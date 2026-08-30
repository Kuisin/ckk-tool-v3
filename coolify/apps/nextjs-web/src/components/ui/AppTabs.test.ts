import { Tabs } from "@mantine/core";
import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { collectTabs, splitList } from "./AppTabs";

/**
 * AppTabs は「呼び出し側が書いた Tabs.List の中身」を読んでドロップダウンを
 * 組む。ここが外れると、畳んだ瞬間にタブが 1 つも出ない（＝画面が使えない）
 * ので、要素の見分け方だけを試験で固定する。DOM は要らない — React 要素を
 * 作って渡すだけ。
 */

const tab = (value: string, label: string, extra: object = {}) =>
  createElement(Tabs.Tab, { value, ...extra }, label);

describe("collectTabs", () => {
  it("Tabs.Tab を並び順に読む", () => {
    const items = collectTabs([tab("a", "明細"), tab("b", "履歴")]);
    expect(items.map((i) => i.value)).toEqual(["a", "b"]);
    expect(items[0].label).toBe("明細");
  });

  it("条件付きのタブ（false / null）は飛ばす", () => {
    const items = collectTabs([
      tab("a", "明細"),
      false,
      null,
      tab("b", "履歴"),
    ]);
    expect(items.map((i) => i.value)).toEqual(["a", "b"]);
  });

  it("Fragment や配列でまとめられていても辿る", () => {
    const items = collectTabs(
      createElement(Fragment, null, tab("a", "A"), [tab("b", "B")]),
    );
    expect(items.map((i) => i.value)).toEqual(["a", "b"]);
  });

  it("leftSection / rightSection / disabled を持ち越す（バッジも出す）", () => {
    const badge = createElement("span", null, "3");
    const [item] = collectTabs([
      tab("a", "承認待ち", { rightSection: badge, disabled: true }),
    ]);
    expect(item.rightSection).toBe(badge);
    expect(item.disabled).toBe(true);
  });

  it("タブが無ければ空（畳む判定側が何もしない）", () => {
    expect(collectTabs(null)).toEqual([]);
  });
});

describe("splitList", () => {
  it("Tabs.List とそれ以外（パネル）を分ける", () => {
    const list = createElement(Tabs.List, null, tab("a", "A"));
    // 「タブ列でないもの」は素通しなので、パネルの代わりに素の要素で足りる。
    const panel = createElement("div", null, "本文");
    const { list: found, rest } = splitList([list, panel]);
    // Children.toArray は要素を key 付きで複製するので、同一参照では比べない
    // （描画には影響しない — key は位置から決まるので毎回同じ）。
    expect(found?.type).toBe(Tabs.List);
    expect(rest).toHaveLength(1);
  });

  it("Tabs.List が無ければ null（タブ列を描かない）", () => {
    // 「タブ列でないもの」は素通しなので、パネルの代わりに素の要素で足りる。
    const panel = createElement("div", null, "本文");
    const { list, rest } = splitList([panel]);
    expect(list).toBe(null);
    expect(rest).toHaveLength(1);
  });
});
