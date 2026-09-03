/**
 * 配っている見本（_docs/samples/inspection-templates/sample-sheets.json）が
 * **取込の形のままである**ことを見張る。
 *
 * 見本が読めなくなるのは、形を変えたときに気づかない典型で、しかも
 * 「まず見本を入れてみる」人が最初に踏む。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { portableFileSchema } from "@/lib/inspection-template-io";

describe("見本ファイルは取込の形に合っている", () => {
  it("そのまま取り込める", () => {
    const raw = JSON.parse(
      readFileSync(
        "../../../_docs/samples/inspection-templates/sample-sheets.json",
        "utf8",
      ),
    );
    const parsed = portableFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.data.templates).toHaveLength(3);
    // 型・抜取・記録方式が一通り出ていること（見本の目的）
    const types = new Set(
      parsed.data.templates.flatMap((t) => t.items.map((i) => i.inputType)),
    );
    expect(types).toEqual(
      new Set(["NUMBER", "BOOLEAN", "SELECT_SINGLE", "SELECT_MULTI"]),
    );
    expect(new Set(parsed.data.templates.map((t) => t.samplingMode))).toEqual(
      new Set(["ALL", "PERCENT", "COUNT"]),
    );
    expect(new Set(parsed.data.templates.map((t) => t.recordStyle))).toEqual(
      new Set(["VALUES", "COUNTS"]),
    );
  });
});
