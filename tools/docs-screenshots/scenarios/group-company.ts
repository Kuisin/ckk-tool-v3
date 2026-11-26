/**
 * 自社法人・書類番号（法人 × 会計年度の連番）・会計連携のシナリオ。
 * 2 社目（TSP）は own-company-master だけが画面で作り、ほかは fixtures/company-tsp.sql で用意する。
 */

import { numberingOtherDocs } from "./numbering-other-docs";
import { numberingPerCompany } from "./numbering-per-company";
import { orderOneCompany } from "./order-one-company";
import { ownCompanyLogo } from "./own-company-logo";
import { ownCompanyMaster } from "./own-company-master";
import { regrindSalesAccount } from "./regrind-sales-account";
import type { AnyScenario } from "./types";

export const companyScenarios: AnyScenario[] = [
  ownCompanyMaster,
  ownCompanyLogo,
  numberingPerCompany,
  numberingOtherDocs,
  orderOneCompany,
  regrindSalesAccount,
];
