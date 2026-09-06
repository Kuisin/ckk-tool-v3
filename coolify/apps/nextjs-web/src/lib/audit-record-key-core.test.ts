import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_KEY_SHAPES,
  auditKeyShape,
  compositeKey,
  isUuid,
  resolveAuditRecordKeySync,
} from "./audit-record-key-core";
import {
  formatDocNumber,
  formatOrderLineNumber,
  parseDocKey,
} from "./doc-number";

describe("compositeKey / parseDocKey", () => {
  it("(yearMonth, seq) と表示番号は可逆", () => {
    const key = parseDocKey("QOT-202608-00003");
    expect(key).toEqual({ yearMonth: "202608", seq: 3 });
    if (!key) throw new Error("parseDocKey returned null");
    expect(formatDocNumber("QOT", key)).toBe("QOT-202608-00003");
  });

  it("seq は padding しない", () => {
    expect(compositeKey("202608", 1)).toBe("202608:1");
    expect(compositeKey("202608", 42)).toBe("202608:42");
  });
});

describe("resolveAuditRecordKeySync", () => {
  it("identity 形は record_id をそのまま返す", () => {
    expect(resolveAuditRecordKeySync("products", "42")).toBe("42");
    expect(
      resolveAuditRecordKeySync("system_settings", "kiosk.unlock_pin"),
    ).toBe("kiosk.unlock_pin");
  });

  it("docKey 形は複合キー文字列へ変換する（padding なし）", () => {
    expect(resolveAuditRecordKeySync("quotes", "QOT-202608-00003")).toBe(
      "202608:3",
    );
    expect(resolveAuditRecordKeySync("estimates", "EST-202608-00001")).toBe(
      "202608:1",
    );
  });

  it("docKey 形は不正な record_id で null を返す", () => {
    expect(resolveAuditRecordKeySync("quotes", "not-a-number")).toBeNull();
  });

  it("stripPrefix 形は最後の # の後ろだけを取り出す", () => {
    expect(
      resolveAuditRecordKeySync("approval_flow_rules", "order_acceptances#7"),
    ).toBe("7");
  });

  it("stripPrefix 形は # が無い・数字でないと null", () => {
    expect(
      resolveAuditRecordKeySync("approval_flow_rules", "order_acceptances"),
    ).toBeNull();
    expect(
      resolveAuditRecordKeySync("approval_flow_rules", "order_acceptances#x"),
    ).toBeNull();
  });

  it("uuidOnly 形は uuid だけ受理する — 不正な呼び出し元は失敗して閉じる", () => {
    const uuid = "9a1c2e34-56f7-4890-abcd-ef0123456789";
    expect(resolveAuditRecordKeySync("design_files", uuid)).toBe(uuid);
    // design_files に productId (int) を渡す既存のバグ（1.5）は解決させない
    expect(resolveAuditRecordKeySync("design_files", "42")).toBeNull();
  });

  it("none 形は常に null", () => {
    expect(
      resolveAuditRecordKeySync("intake_folder", "some-file.pdf"),
    ).toBeNull();
    expect(
      resolveAuditRecordKeySync("kiosk_unlock_pins", "kiosk.unlock_pin"),
    ).toBeNull();
  });

  it("numberToUuid 形は 1 クエリが要るので undefined を返す（呼び出し側に委ねる）", () => {
    expect(resolveAuditRecordKeySync("work_orders", "4711")).toBeUndefined();
    expect(
      resolveAuditRecordKeySync("material_purchase_orders", "PO-202608-00001"),
    ).toBeUndefined();
  });

  it("未登録の表は null（例外を投げない）", () => {
    expect(resolveAuditRecordKeySync("no_such_table", "1")).toBeNull();
  });

  it("record_id が null・空文字なら null", () => {
    expect(resolveAuditRecordKeySync("products", null)).toBeNull();
    expect(resolveAuditRecordKeySync("products", "")).toBeNull();
  });

  it("users の 'self' センチネルは numberToUuid 経由（このテストでは解決不能 = undefined）", () => {
    // "self" は呼び出し元のバグ（1.5 で修正）。numberToUuid 形なので同期解決
    // はできない — 非同期側が username 突合に失敗して null に落とす。
    expect(resolveAuditRecordKeySync("users", "self")).toBeUndefined();
  });
});

describe("isUuid", () => {
  it("uuid 形式だけ true", () => {
    expect(isUuid("9a1c2e34-56f7-4890-abcd-ef0123456789")).toBe(true);
    expect(isUuid("42")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("order_lines の表示番号は可逆（numberToUuid 側の解決に使う）", () => {
  it("枝番つき 3 パート番号を組み立てられる", () => {
    expect(
      formatOrderLineNumber({ yearMonth: "202608", seq: 1, branch: 1 }),
    ).toBe("ORD-202608-00001-01");
  });
});

// ── 網羅性ガード ─────────────────────────────────────────────────────────
//
// recordAudit() が実際に書いている tableName 文字列リテラルを両アプリの
// ソースからスキャンし、AUDIT_KEY_SHAPES に登録が無ければ落とす。
// 新しい監査テーブルを足したのに解決方法を決め忘れる、というレジストリの
// 形骸化を防ぐのが目的（新しい表を足したらここで気づく）。
//
// 動的な tableName（`AUDIT_TABLE[kind]` / `ownerType` 変数）はこの正規表現
// では拾えない — 拾えるのは静的文字列リテラルだけ。それらは個別に
// AUDIT_KEY_SHAPES へ手で足してあることをコメントで確認すること
// （material-numbering の AUDIT_TABLE マップ、attachments/document-memos の
// ownerType）。

const REPO_ROOT = path.join(__dirname, "..", "..", "..", ".."); // → coolify/
const SCAN_DIRS = [
  path.join(REPO_ROOT, "apps", "nextjs-web", "src"),
  path.join(REPO_ROOT, "apps", "nextjs-kiosk", "src"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(p);
  }
  return out;
}

function writtenTableNames(): Set<string> {
  const names = new Set<string>();
  const re = /tableName:\s*"([a-z_]+)"/g;
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) names.add(m[1]);
    }
  }
  return names;
}

describe("AUDIT_KEY_SHAPES の網羅性", () => {
  it("recordAudit が書く全ての tableName リテラルに解決方法が登録されている", () => {
    const written = writtenTableNames();
    const missing = [...written].filter((t) => auditKeyShape(t) === undefined);
    expect(missing).toEqual([]);
  });

  it("登録簿の全エントリが有効な解決方法を持つ", () => {
    const valid = new Set([
      "identity",
      "docKey",
      "numberToUuid",
      "stripPrefix",
      "uuidOnly",
      "none",
    ]);
    for (const [table, shape] of Object.entries(AUDIT_KEY_SHAPES)) {
      expect(valid.has(shape), `${table}: ${shape}`).toBe(true);
    }
  });
});
