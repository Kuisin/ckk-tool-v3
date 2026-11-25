"use server";

/**
 * Server Actions — 自社法人マスタ (MS0I).
 *
 * 書類（見積書・納品書・請求書）の発行元。拠点が 1 つの法人に属し、書類の
 * 法人は拠点から決まる（lib/own-company-core.ts）。コードは識別子なので作成後は
 * 変えない。既定の法人は常に 1 つだけ — 既定に切り替えると他の行の既定は
 * 同じトランザクションで外す（部分 unique index own_companies_is_default_idx）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { OWN_COMPANY_CODE_FORBIDDEN } from "@/lib/doc-ref-core";
import { isValidInvoiceRegistrationNo } from "@/lib/own-company-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  localizedInputOrNull,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject } from "@/lib/storage";
import { isFiscalYearLocked } from "./data";

const BASE_PATH = "/master/own-companies";

function inputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, tr("master.ownCompanies.enterCode"))
      // 書類の参照は `<法人コード>/<番号>`（URL では `~`）。区切りと紛れる文字は
      // コードに使わせない（lib/doc-ref-core.ts）。
      .refine(
        (v) => !OWN_COMPANY_CODE_FORBIDDEN.test(v),
        tr("master.ownCompanies.codeInvalidChars"),
      ),
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    nameKana: z.string().optional(),
    postalCode: z.string().optional(),
    addressJa: z.string().optional(),
    addressTranslations: z.record(z.string(), z.string()).optional(),
    phone: z.string().optional(),
    fax: z.string().optional(),
    email: z
      .string()
      .email(tr("common.invalidEmailFormat"))
      .or(z.literal(""))
      .optional(),
    invoiceRegistrationNo: z
      .string()
      .refine(
        (v) => isValidInvoiceRegistrationNo(v),
        tr("master.ownCompanies.invalidRegistrationNo"),
      )
      .optional(),
    bankName: z.string().optional(),
    bankBranch: z.string().optional(),
    bankAccountType: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    // 会計年度の開始月（法人ごとの採番の年度区切り）。DB の CHECK と同じ範囲。
    fiscalYearStartMonth: z
      .number()
      .int()
      .min(1, tr("master.ownCompanies.invalidFiscalMonth"))
      .max(12, tr("master.ownCompanies.invalidFiscalMonth")),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

export type OwnCompanyInput = z.infer<ReturnType<typeof inputSchema>>;

const opt = (v: string | undefined) => v?.trim() || null;

function companyData(v: OwnCompanyInput) {
  return {
    name: localizedInput(v.nameJa, undefined, v.nameTranslations),
    nameKana: opt(v.nameKana),
    postalCode: opt(v.postalCode),
    address:
      localizedInputOrNull(v.addressJa, undefined, v.addressTranslations) ??
      Prisma.DbNull,
    phone: opt(v.phone),
    fax: opt(v.fax),
    email: opt(v.email),
    invoiceRegistrationNo: opt(v.invoiceRegistrationNo),
    bankName: opt(v.bankName),
    bankBranch: opt(v.bankBranch),
    bankAccountType: opt(v.bankAccountType),
    bankAccountNumber: opt(v.bankAccountNumber),
    bankAccountHolder: opt(v.bankAccountHolder),
    fiscalYearStartMonth: v.fiscalYearStartMonth,
    isDefault: v.isDefault,
    // 既定の法人は無効にできない（拠点の分からない書類の行き先が無くなる）。
    isActive: v.isDefault ? true : v.isActive,
    notes: opt(v.notes),
  };
}

/** 監査ログ用スナップショット（差分表示のためスカラーのみ。口座番号は伏せる）。 */
function auditSnapshot(v: OwnCompanyInput) {
  return {
    code: v.code.trim(),
    nameJa: v.nameJa,
    postalCode: opt(v.postalCode),
    addressJa: opt(v.addressJa),
    phone: opt(v.phone),
    fax: opt(v.fax),
    email: opt(v.email),
    invoiceRegistrationNo: opt(v.invoiceRegistrationNo),
    bankName: opt(v.bankName),
    bankBranch: opt(v.bankBranch),
    fiscalYearStartMonth: v.fiscalYearStartMonth,
    isDefault: v.isDefault,
    isActive: v.isDefault ? true : v.isActive,
    notes: opt(v.notes),
  };
}

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
  revalidatePath("/master/plants");
}

export async function createOwnCompany(
  input: OwnCompanyInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = inputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (v.isDefault) {
        await tx.ownCompany.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.ownCompany.create({
        data: { code: v.code.trim(), ...companyData(v) },
        select: { id: true },
      });
    });
    await recordAudit({
      action: "CREATE",
      tableName: "own_companies",
      recordId: String(created.id),
      after: auditSnapshot(v),
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.createFailed"), tr),
    );
  }
}

export async function updateOwnCompany(
  id: number,
  input: OwnCompanyInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = inputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.ownCompany.findUnique({ where: { id } });
    if (!prior) return actionError(tr("master.ownCompanies.notFound"));
    // 既定は「別の法人を既定にする」ことでしか外せない — 外すだけだと
    // 拠点の分からない書類の発行元が無くなる。
    if (prior.isDefault && !v.isDefault) {
      return actionError(tr("master.ownCompanies.cannotUnsetDefault"));
    }
    // 採番済みの法人は開始月を変えられない（DB もトリガー
    // own_companies_fiscal_month_lock で拒否する）。先にここで分かりやすく断る。
    if (
      v.fiscalYearStartMonth !== prior.fiscalYearStartMonth &&
      (await isFiscalYearLocked(id))
    ) {
      return actionError(tr("master.ownCompanies.fiscalYearLockedError"));
    }
    await prisma.$transaction(async (tx) => {
      if (v.isDefault && !prior.isDefault) {
        await tx.ownCompany.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      // code は識別子のため更新しない。
      await tx.ownCompany.update({ where: { id }, data: companyData(v) });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(id),
      before: {
        code: prior.code,
        postalCode: prior.postalCode,
        phone: prior.phone,
        fax: prior.fax,
        email: prior.email,
        invoiceRegistrationNo: prior.invoiceRegistrationNo,
        bankName: prior.bankName,
        bankBranch: prior.bankBranch,
        fiscalYearStartMonth: prior.fiscalYearStartMonth,
        isDefault: prior.isDefault,
        isActive: prior.isActive,
        notes: prior.notes,
      },
      after: auditSnapshot(v),
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.updateFailed"), tr),
    );
  }
}

export async function setOwnCompanyActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.ownCompany.findUnique({
      where: { id },
      select: { isDefault: true },
    });
    if (!row) return actionError(tr("master.ownCompanies.notFound"));
    if (row.isDefault && !isActive) {
      return actionError(tr("master.ownCompanies.cannotDisableDefault"));
    }
    await prisma.ownCompany.update({ where: { id }, data: { isActive } });
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(id),
      after: { isActive },
    });
    revalidate(id);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.updateFailed"), tr),
    );
  }
}

/** 削除 — 既定でなく、拠点にも請求書にも使われていない法人だけ。 */
export async function deleteOwnCompany(id: number): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.ownCompany.findUnique({
      where: { id },
      select: {
        isDefault: true,
        sealFile: { select: { id: true, storageKey: true } },
        _count: { select: { plants: true, invoices: true } },
      },
    });
    if (!row) return actionError(tr("master.ownCompanies.notFound"));
    if (row.isDefault) {
      return actionError(tr("master.ownCompanies.cannotDeleteDefault"));
    }
    if (row._count.plants > 0 || row._count.invoices > 0) {
      return actionError(
        tr("master.ownCompanies.inUse", {
          plants: row._count.plants,
          invoices: row._count.invoices,
        }),
      );
    }
    await prisma.ownCompany.delete({ where: { id } });
    // 印影は他から参照されないので一緒に片付ける（best-effort）。
    if (row.sealFile) {
      const removed = await prisma.file
        .delete({ where: { id: row.sealFile.id } })
        .then(() => true)
        .catch(() => false);
      if (removed) await deleteObject(row.sealFile.storageKey);
    }
    await recordAudit({
      action: "DELETE",
      tableName: "own_companies",
      recordId: String(id),
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.deleteFailed"), tr),
    );
  }
}
