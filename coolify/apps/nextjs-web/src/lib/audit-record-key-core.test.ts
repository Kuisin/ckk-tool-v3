import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_KEY_SHAPES,
  auditKeyShape,
  isUuid,
  resolveAuditRecordKeySync,
} from "./audit-record-key-core";
import { DOC_TABLE_PREFIX } from "./doc-number";

describe("resolveAuditRecordKeySync", () => {
  it("identity 形は record_id をそのまま返す", () => {
    expect(resolveAuditRecordKeySync("products", "42")).toBe("42");
    expect(
      resolveAuditRecordKeySync("system_settings", "kiosk.unlock_pin"),
    ).toBe("kiosk.unlock_pin");
  });

  it("docKey 形: 法人コード付きの新しい番号はその場で参照になる", () => {
    // id（URL・画面の DTO の姿）
    expect(resolveAuditRecordKeySync("quotes", "CKK~QOT-2026-00003")).toBe(
      "CKK/QOT-2026-00003",
    );
    // 参照（行の doc_ref）
    expect(resolveAuditRecordKeySync("estimates", "CKK/EST-2026-00001")).toBe(
      "CKK/EST-2026-00001",
    );
    // 番号設計 PR-C まで uuid をキーにしていた表も同じ参照に揃う
    expect(
      resolveAuditRecordKeySync(
        "material_purchase_orders",
        "SUB~PO-2026-00001",
      ),
    ).toBe("SUB/PO-2026-00001");
    expect(
      resolveAuditRecordKeySync("design_requests", "CKK/DSG-2026-00007"),
    ).toBe("CKK/DSG-2026-00007");
  });

  it("docKey 形: 注文明細のキーは line_ref", () => {
    expect(
      resolveAuditRecordKeySync("order_lines", "CKK~ORD-2026-00001-02"),
    ).toBe("CKK/ORD-2026-00001-02");
    // 番号だけ・旧番号は法人を引きに行く
    expect(
      resolveAuditRecordKeySync("order_lines", "ORD-2026-00001-02"),
    ).toBeUndefined();
    expect(
      resolveAuditRecordKeySync("order_lines", "ORD-202608-00001-02"),
    ).toBeUndefined();
  });

  it("docKey 形: 番号だけ・旧番号は法人を引く 1 クエリへ委ねる（undefined）", () => {
    // 同じ番号が 2 つの法人にあり得るので、番号だけでは決められない
    expect(
      resolveAuditRecordKeySync("quotes", "QOT-2026-00003"),
    ).toBeUndefined();
    expect(
      resolveAuditRecordKeySync("quotes", "QOT-202608-00003"),
    ).toBeUndefined();
    // 法人コード付きでも旧番号は新しい参照を引く必要がある
    expect(
      resolveAuditRecordKeySync("estimates", "CKK/EST-202608-00001"),
    ).toBeUndefined();
    expect(
      resolveAuditRecordKeySync("material_purchase_orders", "PO-202608-00001"),
    ).toBeUndefined();
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
    // 指示書の record_id はロット番号（通し連番）— 書類番号 WOR-… ではない。
    expect(resolveAuditRecordKeySync("work_orders", "4711")).toBeUndefined();
    expect(
      resolveAuditRecordKeySync("form_responses", "FRM-202608-00001"),
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

describe("番号を DB が払い出す表のキーは参照（docKey 形）", () => {
  it("指示書・外注依頼を除く全ての表が docKey 形で登録されている", () => {
    // 指示書はロット番号で、外注依頼は工程の id で指される。
    const byOtherKey = new Set(["work_orders", "outsource_orders"]);
    for (const table of Object.keys(DOC_TABLE_PREFIX)) {
      if (byOtherKey.has(table)) continue;
      expect(auditKeyShape(table), table).toBe("docKey");
    }
    expect(auditKeyShape("order_lines")).toBe("docKey");
    expect(auditKeyShape("work_orders")).toBe("numberToUuid");
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
