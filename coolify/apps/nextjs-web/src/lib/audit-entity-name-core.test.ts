import { describe, expect, it } from "vitest";
import {
  AUDIT_HAS_ENTITY_NAME,
  extractNameFromPayload,
  hasEntityName,
  jaOf,
  splitCompositeKey,
} from "./audit-entity-name-core";
import {
  AUDIT_KEY_SHAPES,
  type AuditKeyShapeKind,
} from "./audit-record-key-core";

describe("jaOf", () => {
  it("{ ja, en } は ja を優先する", () => {
    expect(jaOf({ ja: "本社工場", en: "HQ Plant" })).toBe("本社工場");
  });

  it("ja が空なら en へ落ちる", () => {
    expect(jaOf({ ja: "", en: "HQ Plant" })).toBe("HQ Plant");
  });

  it("素の文字列はそのまま", () => {
    expect(jaOf("田中太郎")).toBe("田中太郎");
  });

  it("空文字・null・オブジェクトでない値は undefined", () => {
    expect(jaOf("")).toBeUndefined();
    expect(jaOf(null)).toBeUndefined();
    expect(jaOf(undefined)).toBeUndefined();
    expect(jaOf(42)).toBeUndefined();
    expect(jaOf({})).toBeUndefined();
  });
});

describe("extractNameFromPayload", () => {
  it("name / displayName / label / pattern の順で拾う", () => {
    expect(extractNameFromPayload({ name: { ja: "M6 ボルト" } })).toBe(
      "M6 ボルト",
    );
    expect(extractNameFromPayload({ displayName: "田中太郎" })).toBe(
      "田中太郎",
    );
    expect(extractNameFromPayload({ label: "取引先向け発行分" })).toBe(
      "取引先向け発行分",
    );
    expect(extractNameFromPayload({ pattern: "example.com" })).toBe(
      "example.com",
    );
  });

  it("どれも無ければ undefined（他のキーを推測しない）", () => {
    expect(extractNameFromPayload({ isActive: true })).toBeUndefined();
    expect(extractNameFromPayload(null)).toBeUndefined();
    expect(extractNameFromPayload(undefined)).toBeUndefined();
    expect(extractNameFromPayload("not an object")).toBeUndefined();
  });
});

describe("splitCompositeKey", () => {
  it('"parentCode/code" を分ける', () => {
    expect(splitCompositeKey("A/01")).toEqual({ parent: "A", code: "01" });
  });

  it("形が合わなければ null", () => {
    expect(splitCompositeKey("no-slash")).toBeNull();
    expect(splitCompositeKey("/01")).toBeNull();
    expect(splitCompositeKey("A/")).toBeNull();
  });
});

// ── 網羅性ガード ─────────────────────────────────────────────────────────
//
// audit-record-key-core.ts の identity 形（record_key が対象表の PK その
// ものになる表）は、すべてここで「名前を探すか探さないか」を決めてある
// はず — 決め忘れると、新しいマスタ表を足したのに履歴だけ番号のまま、
// という気付きにくい後退が起きる。
describe("AUDIT_HAS_ENTITY_NAME の網羅性", () => {
  const identityTables = Object.entries(AUDIT_KEY_SHAPES)
    .filter(([, shape]: [string, AuditKeyShapeKind]) => shape === "identity")
    .map(([table]) => table);
  // "users" は唯一の例外（numberToUuid 形だが record_key は users.id に揃う —
  // audit-entity-name-core.ts のコメント参照）。
  const coveredTables = [...identityTables, "users"];

  it("identity 形の表（+ users）はすべて true/false のどちらかに決めてある", () => {
    const undecided = coveredTables.filter(
      (t) => AUDIT_HAS_ENTITY_NAME[t] === undefined,
    );
    expect(undecided).toEqual([]);
  });

  it("hasEntityName は登録簿と一致する", () => {
    for (const t of coveredTables) {
      expect(hasEntityName(t)).toBe(AUDIT_HAS_ENTITY_NAME[t] === true);
    }
  });

  it("登録簿に対象外の表名・綴りミスが紛れ込んでいない", () => {
    const coveredSet = new Set(coveredTables);
    const stray = Object.keys(AUDIT_HAS_ENTITY_NAME).filter(
      (t) => !coveredSet.has(t),
    );
    expect(stray).toEqual([]);
  });
});
