import { describe, expect, it } from "vitest";
import {
  PORTAL_DOCUMENT_DTO_KEYS,
  PORTAL_ORDER_LINE_DTO_KEYS,
  PORTAL_PROGRESS,
  PORTAL_PROGRESS_LABEL,
  type PortalDocumentDto,
  type PortalOrderLineDto,
  portalProgressOf,
} from "./portal-progress-core";

describe("portalProgressOf", () => {
  it("確定済みは受注", () => {
    expect(portalProgressOf({ status: "CONFIRMED" })).toBe("RECEIVED");
  });

  it("製造中", () => {
    expect(portalProgressOf({ status: "IN_PRODUCTION" })).toBe("IN_PRODUCTION");
  });

  it("一部出荷は「出荷済み」と言い切る（部分の内訳は出さない）", () => {
    expect(portalProgressOf({ status: "PARTIAL_SHIPPED" })).toBe("SHIPPED");
  });

  it("出荷済み・納品書なしなら出荷済み", () => {
    expect(portalProgressOf({ status: "SHIPPED" }, [])).toBe("SHIPPED");
  });

  it("納品書が納品済みなら納品済み", () => {
    expect(
      portalProgressOf({ status: "SHIPPED" }, [{ deliveredAt: new Date() }]),
    ).toBe("DELIVERED");
  });

  it("納品書があっても未納品なら出荷済みのまま", () => {
    expect(
      portalProgressOf({ status: "SHIPPED" }, [{ deliveredAt: null }]),
    ).toBe("SHIPPED");
  });

  it("キャンセルが最優先（状態が進んでいても）", () => {
    expect(
      portalProgressOf({ status: "SHIPPED", cancelledAt: new Date() }, [
        { deliveredAt: new Date() },
      ]),
    ).toBe("CANCELLED");
    expect(portalProgressOf({ status: "CANCELLED" })).toBe("CANCELLED");
  });

  it("DRAFT が万一届いても、社外向けには最小の段階に倒す", () => {
    expect(portalProgressOf({ status: "DRAFT" })).toBe("RECEIVED");
  });
});

describe("PORTAL_PROGRESS_LABEL", () => {
  it("全段階にラベルがある", () => {
    for (const p of PORTAL_PROGRESS) {
      expect(PORTAL_PROGRESS_LABEL[p], p).toBeTruthy();
    }
  });
});

/**
 * ★ ここが「工程の中身は社外に出さない」を機械で守っている唯一の場所。
 *
 * DTO に項目を足すと、このテストが落ちる。落ちたら「これは取引先に見せて
 * よいか」を考えてからキー一覧を直すこと。既定は**見せない**。
 *
 * 素の行を返してはいけない理由（実測）:
 *   order_lines.lot_number = 指示書番号（キオスクの QR そのもの）
 *   delivery_orders.work_order_id → WorkOrderStep.supplierBp = 外注先
 *   order_acceptances.extracted / .notes / .assigned_plant_id / .sales_rep_id
 *   order_lines.is_locked（承認依頼中であること）
 */
describe("社外へ出す DTO のキー集合", () => {
  it("注文明細の DTO は許可リストのキーだけを持つ", () => {
    const dto: PortalOrderLineDto = {
      branch: 1,
      productName: "製品A",
      quantity: 10,
      unitPrice: "1000",
      amount: "10000",
      deliveryDate: "2026/09/30",
      progress: "RECEIVED",
      shippedOn: null,
    };
    expect(Object.keys(dto).sort()).toEqual([...PORTAL_ORDER_LINE_DTO_KEYS]);
  });

  it("書類の DTO は許可リストのキーだけを持つ", () => {
    const dto: PortalDocumentDto = {
      number: "INV-202609-00001",
      issuedOn: "2026/09/01",
      totalAmount: "10000",
      hasPdf: true,
    };
    expect(Object.keys(dto).sort()).toEqual([...PORTAL_DOCUMENT_DTO_KEYS]);
  });

  it("社内専用の項目名が許可リストに紛れ込んでいない", () => {
    const forbidden = [
      "lotNumber",
      "lot_number",
      "workOrderId",
      "workOrderNumber",
      "supplierBp",
      "supplierBpId",
      "extracted",
      "notes",
      "assignedPlantId",
      "salesRepId",
      "isLocked",
      "createdBy",
      "status",
      "productId",
      "id",
    ];
    const all = [...PORTAL_ORDER_LINE_DTO_KEYS, ...PORTAL_DOCUMENT_DTO_KEYS];
    for (const key of forbidden) {
      expect(all, `社外 DTO に ${key} が入っている`).not.toContain(key);
    }
  });

  it("キー一覧はソート済み（比較を安定させるため）", () => {
    expect([...PORTAL_ORDER_LINE_DTO_KEYS]).toEqual(
      [...PORTAL_ORDER_LINE_DTO_KEYS].sort(),
    );
    expect([...PORTAL_DOCUMENT_DTO_KEYS]).toEqual(
      [...PORTAL_DOCUMENT_DTO_KEYS].sort(),
    );
  });
});
