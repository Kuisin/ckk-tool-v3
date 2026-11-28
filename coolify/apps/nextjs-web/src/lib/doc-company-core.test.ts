import { describe, expect, it } from "vitest";
import {
  companyForAccountingDocument,
  companyForDeliveryNote,
  companyForDeliveryOrder,
  companyForDesignRequest,
  companyForIntake,
  companyForOrderAcceptance,
  companyForPlantDoc,
  companyForPurchaseDoc,
  companyForUnplacedDoc,
  companyForWorkOrder,
  issuingCompanyChoice,
  linesOutsideCompany,
  ownCompanyData,
  resolveIssuingCompanyId,
} from "./doc-company-core";

const DEF = 1;

describe("doc-company-core", () => {
  it("unplaced documents use the default company", () => {
    expect(companyForUnplacedDoc(DEF)).toBe(DEF);
    expect(companyForUnplacedDoc(null)).toBeNull();
  });

  it("order acceptance: header plant > line plants > quote > default", () => {
    expect(
      companyForOrderAcceptance(
        {
          assignedPlantCompanyId: 2,
          linePlantCompanyIds: [3],
          quoteCompanyId: 4,
        },
        DEF,
      ),
    ).toBe(2);
    expect(
      companyForOrderAcceptance(
        { linePlantCompanyIds: [null, 3, 5], quoteCompanyId: 4 },
        DEF,
      ),
    ).toBe(3);
    expect(companyForOrderAcceptance({ quoteCompanyId: 4 }, DEF)).toBe(4);
    expect(companyForOrderAcceptance({}, DEF)).toBe(DEF);
  });

  it("order acceptance: every line plant must belong to the order company", () => {
    // 法人 2 の請書: 2 行目は法人 3 の拠点、4 行目は法人に属さない拠点（= 既定 1）
    expect(
      linesOutsideCompany(
        2,
        [
          { hasPlant: true, plantCompanyId: 2 },
          { hasPlant: true, plantCompanyId: 3 },
          { hasPlant: false },
          { hasPlant: true, plantCompanyId: null },
        ],
        DEF,
      ),
    ).toEqual([2, 4]);
    // 既定の法人の請書なら、法人に属さない拠点は通る
    expect(
      linesOutsideCompany(
        DEF,
        [{ hasPlant: true, plantCompanyId: null }, { hasPlant: false }],
        DEF,
      ),
    ).toEqual([]);
  });

  it("intake: the intake channel decides; an upload follows the uploader", () => {
    // フォルダ取込 — 取込口の法人。入れた人は居ない
    expect(
      companyForIntake(
        { source: "FOLDER", channelCompanyId: 3, uploaderCompanyId: 2 },
        DEF,
      ),
    ).toBe(3);
    expect(companyForIntake({ source: "FOLDER" }, DEF)).toBe(DEF);
    // アップロード — 入れた人の法人 → 取込口 → 既定
    expect(
      companyForIntake(
        { source: "UPLOAD", channelCompanyId: 3, uploaderCompanyId: 2 },
        DEF,
      ),
    ).toBe(2);
    expect(
      companyForIntake({ source: "UPLOAD", channelCompanyId: 3 }, DEF),
    ).toBe(3);
    expect(companyForIntake({ source: "UPLOAD" }, DEF)).toBe(DEF);
  });

  it("design request: quote > order acceptance > default", () => {
    expect(
      companyForDesignRequest(
        { quoteCompanyId: 2, orderAcceptanceCompanyId: 3 },
        DEF,
      ),
    ).toBe(2);
    expect(companyForDesignRequest({ orderAcceptanceCompanyId: 3 }, DEF)).toBe(
      3,
    );
    expect(companyForDesignRequest({}, DEF)).toBe(DEF);
  });

  it("work order: first allocated acceptance > default", () => {
    expect(
      companyForWorkOrder(
        { orderAcceptanceCompanyIds: [undefined, 5, 6] },
        DEF,
      ),
    ).toBe(5);
    expect(companyForWorkOrder({}, DEF)).toBe(DEF);
  });

  it("delivery order: from plant > line plants > default", () => {
    expect(
      companyForDeliveryOrder(
        { fromPlantCompanyId: 2, linePlantCompanyIds: [3] },
        DEF,
      ),
    ).toBe(2);
    expect(
      companyForDeliveryOrder({ linePlantCompanyIds: [null, 3] }, DEF),
    ).toBe(3);
    expect(companyForDeliveryOrder({}, DEF)).toBe(DEF);
  });

  it("delivery note and accounting document inherit their upstream", () => {
    expect(companyForDeliveryNote({ deliveryOrderCompanyId: 7 })).toBe(7);
    expect(companyForAccountingDocument({ invoiceCompanyId: 8 })).toBe(8);
  });

  it("purchase docs and plant docs follow the plant", () => {
    expect(companyForPurchaseDoc({ linePlantCompanyIds: [null, 4] }, DEF)).toBe(
      4,
    );
    expect(companyForPurchaseDoc({}, DEF)).toBe(DEF);
    expect(companyForPlantDoc({ plantCompanyId: 9 }, DEF)).toBe(9);
    expect(companyForPlantDoc({ plantCompanyId: null }, DEF)).toBe(DEF);
  });

  it("issuing company: prefill and who gets the field", () => {
    // 所属拠点が 1 社だけ → その法人が初期値、欄は出さない
    expect(issuingCompanyChoice([2, 2], DEF)).toEqual({
      companyIds: [2],
      prefill: 2,
      selectable: false,
    });
    // 2 社にまたがる → 欄を出す。初期値は既定の法人
    expect(issuingCompanyChoice([2, 3, 2], DEF)).toEqual({
      companyIds: [2, 3],
      prefill: DEF,
      selectable: true,
    });
    // 法人に属さない拠点は既定の法人として数える
    expect(issuingCompanyChoice([null, 2], DEF)).toEqual({
      companyIds: [DEF, 2],
      prefill: DEF,
      selectable: true,
    });
    // 所属拠点なし → 既定の法人、欄は出さない
    expect(issuingCompanyChoice([], DEF)).toEqual({
      companyIds: [],
      prefill: DEF,
      selectable: false,
    });
  });

  it("issuing company: the server only accepts what the form could offer", () => {
    const multi = issuingCompanyChoice([2, 3], DEF);
    expect(resolveIssuingCompanyId(multi, 3)).toEqual({ ok: true, id: 3 });
    expect(resolveIssuingCompanyId(multi, undefined)).toEqual({
      ok: true,
      id: DEF,
    });
    expect(resolveIssuingCompanyId(multi, 9)).toEqual({ ok: false });
    // 選べない人が別の法人を指定してきたら拒否。初期値と同じなら通す
    const single = issuingCompanyChoice([2], DEF);
    expect(resolveIssuingCompanyId(single, 3)).toEqual({ ok: false });
    expect(resolveIssuingCompanyId(single, 2)).toEqual({ ok: true, id: 2 });
    expect(resolveIssuingCompanyId(single, null)).toEqual({ ok: true, id: 2 });
  });

  it("ownCompanyData omits the column when nothing resolves (DB default applies)", () => {
    expect(ownCompanyData(3)).toEqual({ ownCompanyId: 3 });
    expect(ownCompanyData(null)).toEqual({});
  });
});
