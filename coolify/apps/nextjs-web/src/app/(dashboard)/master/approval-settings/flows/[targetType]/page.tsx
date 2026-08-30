import { notFound } from "next/navigation";
import { ApplyModeControl } from "@/components/master/approval-flows/ApplyModeControl";
import { ApprovalFlowEditor } from "@/components/master/approval-flows/ApprovalFlowEditor";
import { ApprovalFlowRulesSection } from "@/components/master/approval-flows/ApprovalFlowRulesSection";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import { conditionsFromJson } from "@/lib/approval-conditions";
import type { ApprovalMode } from "@/lib/approval-flow";
import { loadGroupApprovers } from "@/lib/approval-permissions";
import {
  APPLY_MODE_TARGETS,
  APPROVAL_TARGET,
  FLOW_SETTINGS_TARGET_TYPES,
  isApprovalTargetType,
} from "@/lib/approval-targets";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認フロー 編集 — 書類種別 1 つぶんの承認ステップを並べる (MS0B)。 */
export default async function ApprovalFlowEditPage({
  params,
}: {
  params: Promise<{ targetType: string }>;
}) {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;
  const { targetType } = await params;
  if (!isApprovalTargetType(targetType)) notFound();
  // フォームはフォームごとに段を持つ（設定はフォームの「承認」タブ）。
  // 一覧から外すだけでなく、URL を直接叩かれても開けないようにする。
  if (!FLOW_SETTINGS_TARGET_TYPES.includes(targetType)) notFound();

  const permissionCode = APPROVAL_TARGET[targetType].approvePermission;
  const [steps, groups, permission, rules, plants, flowRow] = await Promise.all(
    [
      prisma.approvalFlowStep.findMany({
        where: { targetType },
        orderBy: { stepNo: "asc" },
      }),
      prisma.approvalGroup.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true, name: true },
      }),
      prisma.permission.findUnique({
        where: { code: permissionCode },
        select: { displayName: true },
      }),
      // 条件付きフロー（無効も出す — 一覧でトグルできる）
      prisma.approvalFlowRule.findMany({
        where: { targetType },
        include: { steps: { orderBy: { stepNo: "asc" } } },
        orderBy: { priority: "asc" },
      }),
      // 条件の動的選択肢（担当拠点）
      prisma.plant.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      // 適用モード（PRE/POST — 対応 target のみ UI に出す）
      prisma.approvalFlow.findUnique({
        where: { targetType },
        select: { applyMode: true },
      }),
    ],
  );

  // 選択肢に出る全グループぶん引く — 段のグループを付け替えた瞬間に
  // 「その人たちは承認できるのか」を出せるようにするため。
  const approvers = await loadGroupApprovers(
    groups.map((g) => g.id),
    [permissionCode],
  );
  const approversByGroup: Record<string, FlowApprover[]> = {};
  for (const [groupId, members] of approvers) {
    approversByGroup[String(groupId)] = members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      allowed: m.capabilities[permissionCode]?.allowed ?? false,
      unrestricted: m.capabilities[permissionCode]?.unrestricted ?? false,
      scopes: m.capabilities[permissionCode]?.scopes ?? [],
    }));
  }

  const targetLabel = APPROVAL_TARGET[targetType].label;
  const groupOptions = groups.map((g) => ({
    value: String(g.id),
    label: localized(g.name as LocalizedText | null),
  }));
  const dynamicOptions = {
    plants: plants.map((p) => ({
      value: String(p.id),
      label: `${p.code} ${localized(p.name as LocalizedText | null)}`,
    })),
  };

  return (
    <ApprovalFlowEditor
      applyModeSection={
        APPLY_MODE_TARGETS.includes(targetType) ? (
          <ApplyModeControl
            initialMode={flowRow?.applyMode ?? "PRE"}
            targetType={targetType}
          />
        ) : undefined
      }
      approversByGroup={approversByGroup}
      groupOptions={groupOptions}
      initialSteps={steps.map((s) => {
        const name = s.name as LocalizedText | null;
        return {
          nameJa: name?.ja ?? "",
          nameTranslations: localizedTranslations(name),
          groupId: String(s.groupId),
          mode: s.mode as ApprovalMode,
        };
      })}
      permissionCode={permissionCode}
      // 権限マスタが未投入でもコードだけは出す（画面が空欄になるより読める）。
      permissionLabel={
        permission
          ? localized(permission.displayName as LocalizedText | null)
          : permissionCode
      }
      rulesSection={
        <ApprovalFlowRulesSection
          dynamicOptions={dynamicOptions}
          groupOptions={groupOptions}
          rules={rules.map((r) => {
            const name = r.name as LocalizedText | null;
            return {
              id: r.id,
              nameJa: name?.ja ?? "",
              nameEn: name?.en ?? "",
              nameTranslations: localizedTranslations(name),
              isActive: r.isActive,
              conditions: conditionsFromJson(r.conditions),
              steps: r.steps.map((s) => {
                const stepName = s.name as LocalizedText | null;
                return {
                  nameJa: stepName?.ja ?? "",
                  nameEn: stepName?.en ?? "",
                  nameTranslations: localizedTranslations(stepName),
                  groupId: String(s.groupId),
                  mode: s.mode as ApprovalMode,
                };
              }),
            };
          })}
          targetLabel={targetLabel}
          targetType={targetType}
        />
      }
      targetLabel={targetLabel}
      targetType={targetType}
    />
  );
}
