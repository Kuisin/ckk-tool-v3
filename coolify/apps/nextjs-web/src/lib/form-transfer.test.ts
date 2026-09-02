import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import type { FormFieldDef } from "./form-schema";
import {
  buildFormExport,
  checksumOf,
  exportFileName,
  FORM_EXPORT_FORMAT,
  type FormExportBody,
  parseFormExport,
  portabilityWarnings,
  remapSelfReferences,
  serializeFormExport,
} from "./form-transfer";

/**
 * `messages/ja.json` はこのテストと並行して他のエージェントが更新中のため、
 * ここで使う新規キー（`general.formsActions.transfer*`）はまだ載っていない
 * ことがある。テスト用にローカルで上書きし、カタログへの反映タイミングに
 * 依存せず期待する日本語文言を検証できるようにする（実際のキーが追加
 * されれば、同じ文言である限りこの上書きは無害）。
 */
const TRANSFER_MESSAGES = {
  transferHeaderTitle: "CKK 業務管理システム — フォーム定義",
  transferHeaderFieldTitle: "タイトル",
  transferHeaderFieldKind: "種類",
  transferHeaderFieldCount: "項目数",
  transferHeaderSource: "書き出し元",
  transferHeaderExportedAt: "書き出し日時",
  transferHeaderNote1:
    "このファイルは「フォームの作り」だけを含みます。回答と共有設定は含みません",
  transferHeaderNote2:
    "（共有先は環境ごとに違うため、取り込んだフォームは非公開で始まります）。",
  transferHeaderNote3:
    "取り込みは フォーム > 取り込み から、このファイルを選ぶか中身を貼り付けます。",
  transferHeaderNote4:
    "以下の JSON は編集しないでください（壊れると取り込めません）。",
  transferEmptyBody: "中身が空です",
  transferInvalidJson:
    "ファイルの形式が読み取れません（JSON が壊れています）。全文が貼られているか確認してください",
  transferWrongFormat: "ファイルの形式が違います",
  transferNotAFormFile: "フォーム定義ファイルではありません",
  transferNewerFormat:
    "このファイルは新しい形式（v{version}）です。アプリを更新してから取り込んでください",
  transferNoTitle: "タイトルがありません",
  transferInvalidKind: "フォームの種類が不正です",
  transferInvalidFields: "項目定義が不正です: {reason}",
  transferChecksumMismatch:
    "チェックサムが一致しません。内容が途中で欠けている可能性があります",
  transferRelatedFieldWarning:
    "「{label}」は別のフォーム（{target}）を参照しています。取り込み先に同じコードのフォームが無ければ、何も表示されません",
  transferRelatedFieldNoTarget:
    "「{label}」の参照先フォームが設定されていません",
  transferAttachmentNotCarried:
    "添付ファイルの項目があります。ファイルそのものは運ばれません（項目の定義だけです）",
  transferFileNamePrefix: "フォーム",
  transferUntitled: "無題",
};

const messages = {
  ...ja,
  common: { ...ja.common, requestOrReport: "申請・報告", survey: "アンケート" },
  general: {
    ...ja.general,
    formsActions: { ...ja.general.formsActions, ...TRANSFER_MESSAGES },
  },
};

const tr = createTranslator({ locale: "ja", messages });

const fields: FormFieldDef[] = [
  {
    key: "companyName",
    label: { ja: "会社名", en: "Company" },
    type: "lookup",
    lookup: { source: "customer" },
    required: true,
    order: 0,
  },
  {
    key: "memo",
    label: { ja: "商談メモ", en: "Notes" },
    type: "textarea",
    required: false,
    order: 1,
  },
];

const body: FormExportBody = {
  title: "商談メモ",
  description: "訪問の記録",
  kind: "REQUEST",
  respondentVisibility: "SHOWN",
  approvalEnabled: true,
  allowMultiple: true,
  responseEditMode: "UNTIL_CLOSE",
  fields,
};

function exported() {
  return buildFormExport({
    sourceEnv: "dev",
    sourceCode: "ABCD2345",
    sourceVersion: 3,
    exportedAt: "2026-08-26T01:00:00.000Z",
    exportedBy: "中田",
    appVersion: "1.2.3",
    form: body,
  });
}

describe("round trip", () => {
  it("書き出して取り込むと同じ定義に戻る", () => {
    const text = serializeFormExport(exported(), tr);
    const parsed = parseFormExport(text, tr);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.form).toEqual(body);
    expect(parsed.data.meta.sourceEnv).toBe("dev");
    expect(parsed.data.meta.sourceCode).toBe("ABCD2345");
    expect(parsed.data.meta.sourceVersion).toBe(3);
  });

  it("見出しを削って JSON だけ貼っても通る", () => {
    const text = serializeFormExport(exported(), tr);
    const jsonOnly = text.slice(text.indexOf("{"));
    const parsed = parseFormExport(jsonOnly, tr);
    expect(parsed.ok).toBe(true);
  });

  it("見出しには中身が読める形で出る", () => {
    const text = serializeFormExport(exported(), tr);
    expect(text).toContain("# タイトル : 商談メモ");
    expect(text).toContain("# 項目数   : 2");
    expect(text).toContain("回答と共有設定は含みません");
  });

  it("受付期間は運ばない（環境ごとの運用で決まるため）", () => {
    const text = serializeFormExport(exported(), tr);
    expect(text).not.toContain("opensAt");
    expect(text).not.toContain("closesAt");
  });
});

describe("checksum", () => {
  it("欠けを検知して警告する（弾きはしない）", () => {
    const data = exported();
    data.form.title = "書き換えられたタイトル";
    const parsed = parseFormExport(serializeFormExport(data, tr), tr);
    // serialize は meta を作り直さないので checksum が合わなくなる
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings.some((w) => w.includes("チェックサム"))).toBe(true);
  });

  it("同じ内容なら同じ値", () => {
    expect(checksumOf("abc")).toBe(checksumOf("abc"));
    expect(checksumOf("abc")).not.toBe(checksumOf("abd"));
  });

  it("8 桁の 16 進", () => {
    expect(checksumOf("")).toMatch(/^[0-9a-f]{8}$/);
    expect(checksumOf("日本語も通る")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("parseFormExport の入力検証", () => {
  it("空は弾く", () => {
    expect(parseFormExport("", tr)).toEqual({
      ok: false,
      error: "中身が空です",
    });
  });

  it("壊れた JSON は弾く", () => {
    const r = parseFormExport("{ これは JSON ではない", tr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("JSON");
  });

  it("別物のファイルは弾く", () => {
    const r = parseFormExport(JSON.stringify({ hello: "world" }), tr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("フォーム定義ファイルではありません");
  });

  it("未来の形式は弾く（黙って読み違えない）", () => {
    const data = exported();
    data.meta.formatVersion = FORM_EXPORT_FORMAT + 1;
    const r = parseFormExport(serializeFormExport(data, tr), tr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("アプリを更新");
  });

  it("項目定義が壊れていれば理由つきで弾く", () => {
    const r = parseFormExport(
      JSON.stringify({
        meta: { formatVersion: 1 },
        form: { ...body, fields: [{ ...fields[0], key: "1invalid" }] },
      }),
      tr,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("項目定義が不正です");
  });

  it("欠けた設定は安全側の既定に寄せる", () => {
    const r = parseFormExport(
      JSON.stringify({
        meta: { formatVersion: 1 },
        form: { title: "最小", kind: "SURVEY", fields: [] },
      }),
      tr,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.form).toMatchObject({
      respondentVisibility: "SHOWN",
      approvalEnabled: false,
      allowMultiple: true,
      responseEditMode: "NONE",
      description: null,
    });
  });
});

describe("portabilityWarnings", () => {
  it("関連レコード一覧の参照先を警告する", () => {
    const w = portabilityWarnings(
      [
        {
          key: "past",
          label: { ja: "過去の商談", en: "" },
          type: "related",
          required: false,
          order: 0,
          related: {
            targetFormCode: "XYZ12345",
            targetFieldKey: "companyName",
            thisFieldKey: "companyName",
            columns: ["memo"],
            limit: 20,
          },
        },
      ],
      tr,
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("XYZ12345");
  });

  it("添付項目があればファイルは運ばれないと伝える", () => {
    const w = portabilityWarnings(
      [
        {
          key: "file",
          label: { ja: "資料", en: "" },
          type: "attachment",
          required: false,
          order: 0,
        },
      ],
      tr,
    );
    expect(w.some((x) => x.includes("ファイルそのものは運ばれません"))).toBe(
      true,
    );
  });

  it("普通の項目だけなら警告なし", () => {
    expect(portabilityWarnings(fields, tr)).toEqual([]);
  });
});

describe("exportFileName", () => {
  it("環境とコードが入る", () => {
    expect(exportFileName("商談メモ", "dev", "ABCD2345", tr)).toBe(
      "フォーム_商談メモ_dev_ABCD2345.txt",
    );
  });
  it("ファイル名に使えない文字を落とす", () => {
    expect(exportFileName('a/b:c*d?"<>|', "main", "X", tr)).toBe(
      "フォーム_abcd_main_X.txt",
    );
  });
  it("空タイトルでも壊れない", () => {
    expect(exportFileName("   ", "dev", "X", tr)).toBe(
      "フォーム_無題_dev_X.txt",
    );
  });
});

describe("remapSelfReferences", () => {
  const related = (targetFormCode: string): FormFieldDef => ({
    key: "field1",
    label: { ja: "過去の報告", en: "" },
    type: "related",
    required: false,
    order: 0,
    related: {
      targetFormCode,
      targetFieldKey: "field4",
      thisFieldKey: "field4",
      columns: ["field1"],
      limit: 20,
    },
  });

  it("自己参照は取り込み後のコードへ張り替える", () => {
    const out = remapSelfReferences(
      [related("SALESRPT")],
      "SALESRPT",
      "NEWCODE",
    );
    expect(out[0].related?.targetFormCode).toBe("NEWCODE");
  });

  it("他フォームへの参照は意図的な外部参照なので触らない", () => {
    const out = remapSelfReferences(
      [related("OTHER123")],
      "SALESRPT",
      "NEWCODE",
    );
    expect(out[0].related?.targetFormCode).toBe("OTHER123");
  });

  it("コードが変わらないときは何もしない", () => {
    const fields = [related("SALESRPT")];
    expect(remapSelfReferences(fields, "SALESRPT", "SALESRPT")[0]).toEqual(
      fields[0],
    );
  });

  it("元の配列を書き換えない", () => {
    const fields = [related("SALESRPT")];
    remapSelfReferences(fields, "SALESRPT", "NEWCODE");
    expect(fields[0].related?.targetFormCode).toBe("SALESRPT");
  });
});
