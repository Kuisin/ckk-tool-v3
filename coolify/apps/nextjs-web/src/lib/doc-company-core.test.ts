import { describe, expect, it } from "vitest";
import {
  companyForAccountingDocument,
  companyForDeliveryNote,
  companyForDeliveryOrder,
  companyForDesignRequest,
  companyForOrderAcceptance,
  companyForPlantDoc,
  companyForPurchaseDoc,
  companyForUnplacedDoc,
  companyForWorkOrder,
  ownCompanyData,
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

  it("ownCompanyData omits the column when nothing resolves (DB default applies)", () => {
    expect(ownCompanyData(3)).toEqual({ ownCompanyId: 3 });
    expect(ownCompanyData(null)).toEqual({});
  });
});
