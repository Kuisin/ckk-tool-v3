/**
 * ボードの絞り込みが**実在するリレーション名**を使っているかを見る。
 *
 * なぜ要るか: 拠点の絞り込みは
 *
 *   ...(filter.plantId ? { step: { plantId } } : {})
 *
 * という**条件付きスプレッド**で足している。TypeScript はスプレッドの結果に
 * 余剰プロパティ検査をかけないので、名前を間違えても tsc は通り、
 * **拠点を選んだときだけ**実行時に落ちる。実際に品質ボードが
 * `workOrderStep`（正しくは `step`）で落ちていた。
 *
 * 生成物（Prisma.dmmf）は client のビルドによっては出ていないので、
 * **スキーマそのものを読む**。prisma/schema/*.prisma は shared-db から
 * 同期される複製で、ここが正。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA_DIR = join(__dirname, "../../prisma/schema");

/** 全 .prisma を 1 本に連結（モデルはファイルをまたいで定義される）。 */
function schemaText(): string {
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".prisma"))
    .map((f) => readFileSync(join(SCHEMA_DIR, f), "utf8"))
    .join("\n");
}

/** そのモデルが持つフィールド名（スカラー・リレーションの両方）。 */
function fieldNames(model: string): string[] {
  const body = new RegExp(`\\bmodel\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    schemaText(),
  );
  if (!body) throw new Error(`モデルが見つかりません: ${model}`);
  return body[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

const source = readFileSync(join(__dirname, "display-board.ts"), "utf8");

describe("ボードの拠点フィルタ", () => {
  // [説明, 起点モデル, 使っているフィールド]
  const cases: Array<[string, string, string]> = [
    ["生産", "WorkOrder", "steps"],
    ["未処理・手配待ち", "OrderLine", "acceptance"],
    ["出荷予定", "DeliveryOrder", "fromPlantId"],
    ["品質・不良", "DefectRecord", "step"],
  ];

  for (const [label, model, field] of cases) {
    it(`${label}: ${model}.${field} は実在する`, () => {
      expect(fieldNames(model)).toContain(field);
    });
  }

  it("品質は step を使う（workOrderStep という名前は存在しない）", () => {
    expect(source).toContain("{ step: { plantId: filter.plantId } }");
    expect(source).not.toContain("workOrderStep: { plantId");
    expect(fieldNames("DefectRecord")).not.toContain("workOrderStep");
  });

  it("絞り込み先の拠点列も実在する", () => {
    expect(fieldNames("WorkOrderStep")).toContain("plantId");
    expect(fieldNames("OrderAcceptance")).toContain("assignedPlantId");
  });
});
