import { describe, expect, it } from "vitest";
import type { AppEntry } from "./app-list";
import {
  DEFAULT_HOME_SETTINGS,
  MAX_GROUP_NAME_LENGTH,
  MAX_HOME_GROUPS,
  organizeHomeApps,
  sanitizeHomeSettings,
  UNGROUPED_SECTION_TITLE,
} from "./home-settings-core";

const app = (key: string, category: AppEntry["category"]): AppEntry => ({
  key,
  label: key,
  operationCode: "XX00",
  href: `/${key}`,
  icon: "IconBox",
  category,
  requiredPermission: null,
});

const APPS: AppEntry[] = [
  app("quotes", "販売"),
  app("trial-estimates", "販売"),
  app("work-orders", "生産"),
  app("docs", "ドキュメント"),
];

const VALID = APPS.map((a) => a.key);

describe("sanitizeHomeSettings", () => {
  it("returns defaults for broken input", () => {
    expect(sanitizeHomeSettings(null, VALID)).toEqual(DEFAULT_HOME_SETTINGS);
    expect(sanitizeHomeSettings("x", VALID)).toEqual(DEFAULT_HOME_SETTINGS);
    expect(sanitizeHomeSettings({ mode: "weird" }, VALID).mode).toBe("default");
  });

  it("drops unknown / duplicate starred keys, keeps order", () => {
    const s = sanitizeHomeSettings(
      { starred: ["docs", "nope", "quotes", "docs", 42] },
      VALID,
    );
    expect(s.starred).toEqual(["docs", "quotes"]);
  });

  it("normalizes groups: trims names, drops empty names, dedupes apps across groups (first wins)", () => {
    const s = sanitizeHomeSettings(
      {
        mode: "custom",
        groups: [
          { name: "  営業  ", apps: ["quotes", "nope", "quotes"] },
          { name: "", apps: ["docs"] },
          { name: "現場", apps: ["quotes", "work-orders"] },
        ],
      },
      VALID,
    );
    expect(s.groups).toEqual([
      { name: "営業", apps: ["quotes"] },
      { name: "現場", apps: ["work-orders"] },
    ]);
  });

  it("caps group count and name length", () => {
    const groups = Array.from({ length: MAX_HOME_GROUPS + 5 }, (_, i) => ({
      name: `g${i}`.padEnd(MAX_GROUP_NAME_LENGTH + 10, "x"),
      apps: [],
    }));
    const s = sanitizeHomeSettings({ groups }, VALID);
    expect(s.groups).toHaveLength(MAX_HOME_GROUPS);
    expect(s.groups[0]?.name).toHaveLength(MAX_GROUP_NAME_LENGTH);
  });
});

describe("organizeHomeApps", () => {
  it("default mode: category sections in fixed order, starred excluded", () => {
    const { starred, sections } = organizeHomeApps(APPS, {
      mode: "default",
      starred: ["work-orders", "docs"],
      groups: [],
    });
    expect(starred.map((a) => a.key)).toEqual(["work-orders", "docs"]);
    expect(sections.map((s) => s.title)).toEqual(["販売"]);
    expect(sections[0]?.apps.map((a) => a.key)).toEqual([
      "quotes",
      "trial-estimates",
    ]);
    expect(sections[0]?.category).toBe("販売");
  });

  it("custom mode: groups in order + その他 for unassigned", () => {
    const { sections } = organizeHomeApps(APPS, {
      mode: "custom",
      starred: [],
      groups: [
        { name: "よく使う", apps: ["work-orders", "quotes"] },
        { name: "空", apps: [] },
      ],
    });
    expect(sections.map((s) => s.title)).toEqual([
      "よく使う",
      UNGROUPED_SECTION_TITLE,
    ]);
    expect(sections[0]?.apps.map((a) => a.key)).toEqual([
      "work-orders",
      "quotes",
    ]);
    expect(sections[1]?.apps.map((a) => a.key)).toEqual([
      "trial-estimates",
      "docs",
    ]);
  });

  it("custom mode: starred apps stay out of groups; apps hidden by flags disappear", () => {
    const visible = APPS.filter((a) => a.key !== "docs"); // docs disabled
    const { starred, sections } = organizeHomeApps(visible, {
      mode: "custom",
      starred: ["quotes"],
      groups: [{ name: "G", apps: ["quotes", "docs", "work-orders"] }],
    });
    expect(starred.map((a) => a.key)).toEqual(["quotes"]);
    expect(sections.map((s) => s.title)).toEqual([
      "G",
      UNGROUPED_SECTION_TITLE,
    ]);
    expect(sections[0]?.apps.map((a) => a.key)).toEqual(["work-orders"]);
  });
});
