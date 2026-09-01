/**
 * **検査表に列が増えたのに書き出し / 取込へ足し忘れる**のを止める。
 *
 * 実際に起きた: #703 で検査表と検査項目に 8 列（layout_style / sample_naming /
 * section / department / measurement_equipment / nominal_value /
 * tolerance_top_delta / tolerance_bottom_delta）が増えたが、書き出しは何も
 * 言わずにそれらを落とし、取り込むと既定値へ戻っていた。**書き出して戻すと
 * 設定が消える**という、この機能がいちばんやってはいけない壊れ方。
 *
 * 型では捕まらない: 書き出しは Prisma の行から必要な列だけ拾って組み立てるので、
 * 拾わない列があっても何も起きない。だからスキーマを読んで突き合わせる。
 *
 * 列を足したら、このどちらかを必ず行うこと:
 *   持ち出す   … portableTemplateSchema / portableItemSchema に足す
 *   持ち出さない … 下の EXCLUDED に**理由を書いて**足す
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  portableItemSchema,
  portableTemplateSchema,
} from "./inspection-template-io";

const SCHEMA = readFileSync(
  "../../../shared-db/prisma/schema/production-master.prisma",
  "utf8",
);

/** モデルのスカラー列（リレーション・属性行は除く）。 */
function columnsOf(model: string): string[] {
  const body = new RegExp(`\\bmodel\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    SCHEMA,
  );
  if (!body) throw new Error(`モデルが見つかりません: ${model}`);
  return body[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/))
    .filter(([, type]) => {
      // リレーション（大文字始まりの型で ? や [] を除いた素の名前）は対象外
      const base = (type ?? "").replace(/[?[\]]/g, "");
      return (
        !/^[A-Z]/.test(base) ||
        /^(Json|String|Int|Boolean|Decimal|DateTime|Float|BigInt)$/.test(
          base,
        ) ||
        isEnum(base)
      );
    })
    .map(([name]) => name);
}

function isEnum(name: string): boolean {
  return new RegExp(`\\benum\\s+${name}\\s*\\{`).test(SCHEMA);
}

/** 持ち出さない列と、その理由。 */
const EXCLUDED_TEMPLATE: Record<string, string> = {
  id: "行の id。取込先では別の値になる",
  version: "取込側が採番する（既存の版は書き換えない）",
  relatedProcessStepId: "id ではなくコードで持つ（relatedProcessStepCode）",
  createdAt: "取込した時刻が正しい",
  updatedAt: "同上",
  approvalGroupId:
    "承認グループは環境ごとの id（コードを持たない）で、テンプレートの" +
    "測定定義とは別の設定。書き出し/取込の対象外（承認設定 MS0B 側で環境ごとに設定）",
  productId:
    "対象製品は環境ごとの id（製品は業務キーを持たない）。測定定義とは" +
    "別のナビゲーション用の絞り込みなので、取込側で改めて設定する",
  groupId:
    "ナビゲーション用グループも環境ごとの id。判定・PDF に影響しない" +
    "表示軸なので、取込側で改めて設定する",
  imageFileId:
    "参考画像は SeaweedFS の実体を指す環境ごとの id。バイナリは" +
    "JSON に載らないため、取込側で改めてアップロードする",
};

const EXCLUDED_ITEM: Record<string, string> = {
  id: "行の id",
  templateId: "取込時に結び直す",
  sortOrder: "配列の並びがそのまま順序になる",
};

describe("書き出し / 取込が検査表の全列を扱っているか", () => {
  it("検査表（inspection_templates）", () => {
    const shape = Object.keys(portableTemplateSchema.shape);
    const missing = columnsOf("InspectionTemplate").filter(
      (c) => !shape.includes(c) && !(c in EXCLUDED_TEMPLATE),
    );
    expect(missing, `持ち出しに入っていない列: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("検査項目（inspection_template_items）", () => {
    const shape = Object.keys(portableItemSchema.shape);
    const missing = columnsOf("InspectionTemplateItem").filter(
      (c) => !shape.includes(c) && !(c in EXCLUDED_ITEM),
    );
    expect(missing, `持ち出しに入っていない列: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  // 除外は「うっかり」ではなく「決めたこと」であってほしい
  it("除外した列は実在する（消えた列が除外表に残らない）", () => {
    const t = columnsOf("InspectionTemplate");
    for (const c of Object.keys(EXCLUDED_TEMPLATE)) expect(t).toContain(c);
    const i = columnsOf("InspectionTemplateItem");
    for (const c of Object.keys(EXCLUDED_ITEM)) expect(i).toContain(c);
  });
});
