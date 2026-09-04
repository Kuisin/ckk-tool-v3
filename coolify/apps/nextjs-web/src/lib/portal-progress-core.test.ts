import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import type { Tr } from "./i18n";
import {
  PORTAL_DOCUMENT_DETAIL_DTO_KEYS,
  PORTAL_DOCUMENT_DTO_KEYS,
  PORTAL_LINE_ITEM_DTO_KEYS,
  PORTAL_ORDER_LINE_DETAIL_DTO_KEYS,
  PORTAL_ORDER_LINE_DTO_KEYS,
  PORTAL_PROGRESS,
  PORTAL_PROGRESS_STEPS,
  PORTAL_RELATED_DOCUMENT_DTO_KEYS,
  type PortalDocumentDetailDto,
  type PortalDocumentDto,
  type PortalLineItemDto,
  type PortalOrderLineDetailDto,
  type PortalOrderLineDto,
  type PortalRelatedDocumentDto,
  parsePortalOrderLineNumber,
  portalOrderLineNumber,
  portalProgressLabel,
  portalProgressOf,
  portalProgressStepIndex,
  summarizePortalOrders,
} from "./portal-progress-core";

// biome-ignore lint/suspicious/noExplicitAny: same rationale as product-types.test.ts
const tr = createTranslator({ locale: "ja", messages: ja as any }) as Tr;

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

describe("portalProgressLabel", () => {
  it("全段階にラベルがある", () => {
    for (const p of PORTAL_PROGRESS) {
      expect(portalProgressLabel(p, tr), p).toBeTruthy();
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
    const all = [
      ...PORTAL_ORDER_LINE_DTO_KEYS,
      ...PORTAL_DOCUMENT_DTO_KEYS,
      ...PORTAL_ORDER_LINE_DETAIL_DTO_KEYS,
      ...PORTAL_DOCUMENT_DETAIL_DTO_KEYS,
      ...PORTAL_LINE_ITEM_DTO_KEYS,
      ...PORTAL_RELATED_DOCUMENT_DTO_KEYS,
    ];
    for (const key of forbidden) {
      expect(all, `社外 DTO に ${key} が入っている`).not.toContain(key);
    }
  });

  it("書類の詳細 DTO は許可リストのキーだけを持つ", () => {
    const dto: PortalDocumentDetailDto = {
      type: "invoices",
      number: "INV-202609-00001",
      issuedOn: "2026-09-01",
      totalAmount: "10000",
      hasPdf: true,
      pdfFileId: "00000000-0000-0000-0000-000000000000",
      currency: "JPY",
      showsPrices: true,
      lineItems: [],
      related: [],
      validUntil: null,
      customerOrderRef: null,
      orderedOn: null,
      deliveredOn: null,
      billingPeriodFrom: "2026-09-01",
      billingPeriodTo: "2026-09-30",
      dueDate: "2026-10-31",
      subtotal: "9000",
      taxAmount: "1000",
    };
    expect(Object.keys(dto).sort()).toEqual([
      ...PORTAL_DOCUMENT_DETAIL_DTO_KEYS,
    ]);
    // 詳細は一覧の上位互換であること。
    for (const key of PORTAL_DOCUMENT_DTO_KEYS) {
      expect(PORTAL_DOCUMENT_DETAIL_DTO_KEYS).toContain(key);
    }
  });

  it("明細 1 行の DTO は許可リストのキーだけを持つ", () => {
    const dto: PortalLineItemDto = {
      label: "製品A",
      quantity: 10,
      unitPrice: "1000",
      amount: "10000",
      deliveryDate: "2026-09-30",
    };
    expect(Object.keys(dto).sort()).toEqual([...PORTAL_LINE_ITEM_DTO_KEYS]);
  });

  it("関連書類の DTO は番号と日付だけを持つ（内部 id を持たない）", () => {
    const dto: PortalRelatedDocumentDto = {
      type: "invoices",
      number: "INV-202609-00001",
      issuedOn: "2026-09-01",
    };
    expect(Object.keys(dto).sort()).toEqual([
      ...PORTAL_RELATED_DOCUMENT_DTO_KEYS,
    ]);
  });

  it("注文明細の詳細 DTO は一覧の許可リスト + 明示した 4 つだけ", () => {
    const dto: PortalOrderLineDetailDto = {
      branch: 1,
      productName: "製品A",
      quantity: 10,
      unitPrice: "1000",
      amount: "10000",
      deliveryDate: "2026-09-30",
      progress: "RECEIVED",
      shippedOn: null,
      acceptanceNumber: "ORD-202609-00001",
      customerOrderRef: "PO-123",
      orderedOn: "2026-09-01",
      related: [],
    };
    expect(Object.keys(dto).sort()).toEqual([
      ...PORTAL_ORDER_LINE_DETAIL_DTO_KEYS,
    ]);
    // 詳細は一覧の上位互換であること（片方だけ広がると見え方が食い違う）。
    for (const key of PORTAL_ORDER_LINE_DTO_KEYS) {
      expect(PORTAL_ORDER_LINE_DETAIL_DTO_KEYS).toContain(key);
    }
  });

  it("キー一覧はソート済み（比較を安定させるため）", () => {
    for (const keys of [
      PORTAL_ORDER_LINE_DTO_KEYS,
      PORTAL_DOCUMENT_DTO_KEYS,
      PORTAL_ORDER_LINE_DETAIL_DTO_KEYS,
      PORTAL_DOCUMENT_DETAIL_DTO_KEYS,
      PORTAL_LINE_ITEM_DTO_KEYS,
      PORTAL_RELATED_DOCUMENT_DTO_KEYS,
    ]) {
      expect([...keys]).toEqual([...keys].sort());
    }
  });
});

describe("進捗の段", () => {
  it("段はキャンセルを含まない（進行の外なので段にしない）", () => {
    expect(PORTAL_PROGRESS_STEPS).not.toContain("CANCELLED");
    expect(portalProgressStepIndex("CANCELLED")).toBe(-1);
  });

  it("段の番号は PORTAL_PROGRESS_STEPS の並び順", () => {
    expect(portalProgressStepIndex("RECEIVED")).toBe(0);
    expect(portalProgressStepIndex("DELIVERED")).toBe(
      PORTAL_PROGRESS_STEPS.length - 1,
    );
  });
});

describe("注文明細番号", () => {
  it("枝番を 2 桁に揃えて組み立てる", () => {
    expect(portalOrderLineNumber("ORD-202609-00001", 1)).toBe(
      "ORD-202609-00001-01",
    );
    expect(portalOrderLineNumber("ORD-202609-00001", 12)).toBe(
      "ORD-202609-00001-12",
    );
  });

  it("枝番の無い行（確定前）は番号を持たない", () => {
    expect(portalOrderLineNumber("ORD-202609-00001", null)).toBeNull();
  });

  it("組み立てた番号はそのまま読み戻せる", () => {
    const number = portalOrderLineNumber("ORD-202609-00042", 7);
    expect(number).not.toBeNull();
    expect(parsePortalOrderLineNumber(number as string)).toEqual({
      yearMonth: "202609",
      seq: 42,
      branch: 7,
    });
  });

  it("形の違う入力は受け取らない（URL から来る値なので必ず検証する）", () => {
    for (const bad of [
      "",
      "ORD-202609-00001", // 枝番が無い
      "QOT-202609-00001-01", // 別の書類
      "ORD-2026-00001-01", // 年月が 6 桁でない
      "ORD-202609-1-01", // 連番が 5 桁でない
      "ORD-202609-00001-01-02", // 余分な枝
      "../../etc/passwd",
    ]) {
      expect(parsePortalOrderLineNumber(bad), bad).toBeNull();
    }
  });
});

describe("summarizePortalOrders", () => {
  it("段ごとに数え、納品済み・キャンセルは「進行中」に数えない", () => {
    const summary = summarizePortalOrders([
      { progress: "RECEIVED" },
      { progress: "IN_PRODUCTION" },
      { progress: "IN_PRODUCTION" },
      { progress: "DELIVERED" },
      { progress: "CANCELLED" },
    ]);
    expect(summary.total).toBe(5);
    expect(summary.active).toBe(3);
    expect(summary.byProgress.IN_PRODUCTION).toBe(2);
    expect(summary.byProgress.DELIVERED).toBe(1);
  });

  it("0 件でも全ての段が 0 で埋まる（段が飛んで見えないように）", () => {
    const summary = summarizePortalOrders([]);
    for (const progress of PORTAL_PROGRESS) {
      expect(summary.byProgress[progress]).toBe(0);
    }
    expect(summary.active).toBe(0);
  });
});
