import { notFound } from "next/navigation";
import type { FormFlowStep } from "@/components/forms/FormApprovalPanel";
import { FormDetail } from "@/components/forms/FormDetail";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import type { ApprovalMode } from "@/lib/approval-flow";
import {
  loadApproveCapabilities,
  loadGroupApprovers,
} from "@/lib/approval-permissions";
import { fetchAuditEntries } from "@/lib/audit";
import { sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchForm, formAccess, listResponses } from "@/lib/forms";
import { listShareGrants } from "@/lib/share-grants";
import { saveShareGrants, setFormStatus } from "../actions";

const APPROVE_PERMISSION = "form";

/** 承認タブに渡すもの（段・グループ選択肢・承認できる人・権限ラベル）。 */
async function loadFormApprovalPanel(formId: string): Promise<{
  steps: FormFlowStep[];
  groupOptions: { value: string; label: string }[];
  approversByGroup: Record<string, FlowApprover[]>;
  permissionLabel: string;
}> {
  const [steps, groups, permission] = await Promise.all([
    prisma.formApprovalStep.findMany({
      where: { formId },
      include: {
        approver: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { stepNo: "asc" },
    }),
    prisma.approvalGroup.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
    prisma.permission.findUnique({
      where: { code: APPROVE_PERMISSION },
      select: { displayName: true },
    }),
  ]);

  // 選択肢に出る全グループぶん引く — 段のグループを付け替えた瞬間に
  // 「その人たちは承認できるのか」を出せるようにするため（MS0B と同じ）。
  const approvers = await loadGroupApprovers(
    groups.map((g) => g.id),
    [APPROVE_PERMISSION],
  );
  // 段に直接刺さっている個人の権限（グループ経由ではないので別に引く）。
  const individualCaps = await loadApproveCapabilities(
    steps.map((s) => s.approverUserId).filter((v) => v != null),
    [APPROVE_PERMISSION],
  );

  const approversByGroup: Record<string, FlowApprover[]> = {};
  for (const [groupId, members] of approvers) {
    approversByGroup[String(groupId)] = members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      allowed: m.capabilities[APPROVE_PERMISSION]?.allowed ?? false,
      unrestricted: m.capabilities[APPROVE_PERMISSION]?.unrestricted ?? false,
      scopes: m.capabilities[APPROVE_PERMISSION]?.scopes ?? [],
    }));
  }

  return {
    steps: steps.map((s) => {
      const name = s.name as LocalizedText | null;
      return {
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        groupId: s.groupId == null ? null : String(s.groupId),
        mode: s.mode as ApprovalMode,
        approverUserId: s.approverUserId,
        approverName: s.approver
          ? s.approver.displayName || s.approver.username
          : null,
        // 保存済みの個人はここで権限を解いて渡す（選び直さなくても
        // 「承認できない人が刺さっている」ことが画面で分かるように）。
        approverAllowed: s.approverUserId
          ? (individualCaps.get(s.approverUserId)?.get(APPROVE_PERMISSION)
              ?.allowed ?? false)
          : undefined,
      };
    }),
    groupOptions: groups.map((g) => ({
      value: String(g.id),
      label: localized(g.name as LocalizedText | null),
    })),
    approversByGroup,
    permissionLabel:
      localized(permission?.displayName as LocalizedText | null) ||
      APPROVE_PERMISSION,
  };
}

import { fetchRoleOptions } from "../data";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) notFound();

  // 権限コードだけでは足りない — このフォームを見てよいかは共有設定が決める。
  const access = await formAccess(form);
  if (!access.canRead) notFound();

  const viewerId = await sessionUserId();
  const [responses, grants, roleOptions, auditEntries] = await Promise.all([
    listResponses(form, access.responseScope, viewerId),
    listShareGrants("forms", code),
    fetchRoleOptions(),
    fetchAuditEntries("forms", code),
  ]);

  // 承認タブの中身。申請・報告フォームだけが対象で、段の宛先（承認グループ）と
  // 「その人たちは実際に承認できるのか」までここで解いて渡す。
  const approval =
    form.kind === "REQUEST" ? await loadFormApprovalPanel(form.id) : null;

  return (
    <FormDetail
      approval={approval}
      auditEntries={auditEntries}
      canEdit={access.canEdit}
      canManage={access.canManage}
      form={form}
      grants={grants}
      onSaveShare={async (next) => {
        "use server";
        const result = await saveShareGrants(
          code,
          next as Parameters<typeof saveShareGrants>[1],
        );
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      onSetStatus={async (status) => {
        "use server";
        const result = await setFormStatus(code, status);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      responses={responses}
      roleOptions={roleOptions}
    />
  );
}
