"use client";

/**
 * UserDetail — ユーザー管理（SY01）の詳細。
 *
 * プロフィール概要 + ロール割当履歴（user_role_relation）+ 実効権限
 * （user_permissions ビュー = 有効ロール経由の全 grant 行）+ 所属拠点
 * （user_plants — PLANT/REGION スコープ解決の基盤）を表示する。
 * ロール割当と所属拠点は user_admin を持つ人だけが編集でき、管理者以外は
 * 「変更依頼」になる（承認が適用する。方式 B — lib/user-change-requests.ts）。
 * どちらも既定は閲覧で、編集は EditablePanel から明示的に始める
 * （design.md §10.10 — 詳細画面は読みに来る人のほうが多い）。
 */

import {
  Alert,
  Badge,
  Group,
  MultiSelect,
  Paper,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  updateUserPlants,
  updateUserRoles,
} from "@/app/(dashboard)/settings/users/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { LoginAttemptList } from "@/components/settings/security/LoginAttemptList";
import { UserDeviceList } from "@/components/settings/security/UserDeviceList";
import {
  UserActiveBadge,
  UserGroupBadge,
} from "@/components/settings/UsersTable";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, FormActions, SummaryGrid } from "@/components/ui/shells";
import { permissionActionLabel, permissionScopeLabel } from "@/lib/enum-labels";
import { localized } from "@/lib/format";
import type { LoginAttemptRow, UserDeviceRow } from "@/lib/login-attempts";
import { permissionLabel, permissionSummary } from "@/lib/permission-labels";
import { canUpdateRoles } from "@/lib/user-change-core";
import type {
  AdminUserDetail,
  AdminUserPlant,
  AdminUserRole,
} from "@/lib/users-admin";

function roleLabel(role: {
  rolename: string;
  displayName: AdminUserDetail["roles"][number]["displayName"];
}): string {
  const label = localized(role.displayName);
  return label === "—" ? role.rolename : label;
}

/**
 * ロール変更のガードに要る事実。画面とサーバーが同じ判定を見るために、
 * 「誰が操作しているか」「対象は管理者か」「他に管理者が居るか」を
 * ページ側（サーバー）で数えて渡す（クライアントで数え直さない）。
 */
export interface RoleGuardFacts {
  actorId: string;
  adminRoleIds: number[];
  targetIsAdmin: boolean;
  otherActiveAdminCount: number;
}

function plantLabel(p: AdminUserPlant): string {
  return `${p.code} ${localized(p.name)}`;
}

/** ロール割当の編集フォーム（user_admin。管理者以外は変更依頼になる）。 */
function UserRolesEditor({
  user,
  roleOptions,
  guard,
  requiresApproval,
  onCancel,
  onSaved,
}: {
  user: AdminUserDetail;
  roleOptions: AdminUserRole[];
  guard: RoleGuardFacts;
  requiresApproval: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const assignedIds = useMemo(
    () => user.roles.map((r) => String(r.id)),
    [user.roles],
  );
  const [value, setValue] = useState<string[]>(assignedIds);
  const [reason, setReason] = useState("");

  const options = useMemo(() => {
    // 選択肢に無いロールが割当済みなら足す（消えたロールを黙って外さないため）。
    const byId = new Map<string, { value: string; label: string }>();
    for (const r of roleOptions) {
      byId.set(String(r.id), { value: String(r.id), label: roleLabel(r) });
    }
    for (const r of user.roles) {
      if (!byId.has(String(r.id))) {
        byId.set(String(r.id), { value: String(r.id), label: roleLabel(r) });
      }
    }
    return [...byId.values()];
  }, [roleOptions, user.roles]);

  const selectedIds = useMemo(() => value.map((v) => Number(v)), [value]);
  // ボタンの活性は Server Action と**同じ関数**が決める（押してから断られない）。
  const check = canUpdateRoles(
    selectedIds,
    {
      actorId: guard.actorId,
      targetUserId: user.id,
      knownRoleIds: new Set(options.map((o) => Number(o.value))),
      adminRoleIds: new Set(guard.adminRoleIds),
      otherActiveAdminCount: guard.otherActiveAdminCount,
      targetIsAdmin: guard.targetIsAdmin,
    },
    tr,
  );

  const dirty =
    value.length !== assignedIds.length ||
    value.some((v) => !assignedIds.includes(v));

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateUserRoles(
        user.id,
        selectedIds,
        reason.trim() || undefined,
      );
      if (result.ok) {
        notifications.show({
          title: result.data.requested
            ? tr("settings.userDetail.approvalWasRequested")
            : tr("common.saved2"),
          message: result.data.requested
            ? tr("settings.userDetail.theRolesChangeOnceApproved")
            : tr("settings.userDetail.theRolesWereUpdated"),
          color: result.data.requested ? "blue" : "green",
        });
        router.refresh();
        onSaved();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <MultiSelect
        clearable
        data={options}
        onChange={setValue}
        placeholder={value.length === 0 ? tr("common.selectARole") : undefined}
        searchable
        value={value}
      />
      {/* 権限が increases/decreases する操作なので、止めた理由をその場に出す。 */}
      {!check.ok && check.message && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mt="sm">
          {check.message}
        </Alert>
      )}
      {value.length === 0 && check.ok && (
        <Alert color="orange" icon={<IconAlertTriangle size={16} />} mt="sm">
          {tr("settings.userDetail.removingEveryRoleLeavesNoPermissions")}
        </Alert>
      )}
      {requiresApproval && (
        <Textarea
          autosize
          description={tr("common.theApproverDecidesBasedOnWhat")}
          label={tr("settings.userDetail.reasonForTheChange")}
          minRows={2}
          mt="sm"
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr("settings.userDetail.eGChangingRolesDueTo")}
          value={reason}
          withAsterisk
        />
      )}
      <FormActions
        disabled={!dirty || !check.ok || (requiresApproval && !reason.trim())}
        loading={isPending}
        onCancel={onCancel}
        onSave={handleSave}
        submitLabel={
          requiresApproval
            ? tr("settings.userDetail.requestApprovalButton")
            : undefined
        }
      />
    </>
  );
}

/** ロール割当カード — 閲覧は割当履歴の表、編集は MultiSelect。 */
function UserRolesCard({
  user,
  roleOptions,
  guard,
  canEdit,
  requiresApproval,
}: {
  user: AdminUserDetail;
  roleOptions: AdminUserRole[];
  guard: RoleGuardFacts;
  canEdit: boolean;
  requiresApproval: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();

  // 閲覧は**履歴のまま**にする — いま何を持っているかだけでなく、いつ誰の分が
  // 外れたのかが SY01 を開く理由そのものなので、有効な行だけに絞らない。
  const view =
    user.assignments.length === 0 ? (
      <Text c="dimmed" size="sm">
        {tr("settings.userDetail.noRoleIsAssigned")}
      </Text>
    ) : (
      <Table.ScrollContainer minWidth={480}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("common.role")}</Table.Th>
              <Table.Th>rolename</Table.Th>
              <Table.Th>{tr("common.status")}</Table.Th>
              <Table.Th>{tr("settings.userDetail.assignedOn")}</Table.Th>
              <Table.Th>{tr("settings.userDetail.releasedAt")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {user.assignments.map((a) => (
              <Table.Tr key={a.rolename}>
                <Table.Td>
                  <Text fw={500} size="sm">
                    {roleLabel(a)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" ff="mono" size="sm">
                    {a.rolename}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <UserActiveBadge isActive={a.isActive} />
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm">
                    {a.assignedAt ? fmt.dateTime(a.assignedAt) : "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm">
                    {a.deactivateAt ? fmt.dateTime(a.deactivateAt) : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="sm" order={5}>
        {tr("settings.userDetail.roleAssignment")}
      </Title>
      <Text c="dimmed" mb="sm" size="xs">
        {tr("settings.userDetail.rolesDecideWhatThisPersonCanDo")}
      </Text>
      <EditablePanel
        canEdit={canEdit}
        edit={({ close }) => (
          <UserRolesEditor
            guard={guard}
            onCancel={close}
            onSaved={close}
            requiresApproval={requiresApproval}
            roleOptions={roleOptions}
            user={user}
          />
        )}
        view={view}
      />
    </Paper>
  );
}

/** 所属拠点カードの編集フォーム（system:ADMIN のみ、または変更依頼）。 */
function UserPlantsEditor({
  user,
  plantOptions,
  requiresApproval,
  onCancel,
  onSaved,
}: {
  user: AdminUserDetail;
  plantOptions: AdminUserPlant[];
  requiresApproval: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const assignedIds = useMemo(
    () => user.plants.map((p) => String(p.id)),
    [user.plants],
  );
  const [value, setValue] = useState<string[]>(assignedIds);
  const [reason, setReason] = useState("");
  const options = useMemo(() => {
    // 無効化済みでも割当済みの拠点は選択肢に残す（外すと保存で消えるため明示）。
    const byId = new Map<string, { value: string; label: string }>();
    for (const p of plantOptions) {
      byId.set(String(p.id), { value: String(p.id), label: plantLabel(p) });
    }
    for (const p of user.plants) {
      if (!byId.has(String(p.id))) {
        byId.set(String(p.id), {
          value: String(p.id),
          label: tr("settings.userDetail.plantLabelDisabled", {
            label: plantLabel(p),
          }),
        });
      }
    }
    return [...byId.values()];
  }, [plantOptions, user.plants, tr]);

  const dirty =
    value.length !== assignedIds.length ||
    value.some((v) => !assignedIds.includes(v));

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateUserPlants(
        user.id,
        value.map((v) => Number(v)),
        reason.trim() || undefined,
      );
      if (result.ok) {
        // 依頼だったのに「保存しました」と出すと、変わっていないものが変わったと
        // 伝わる。サーバーが返した requested をそのまま文言に反映する。
        notifications.show({
          title: result.data.requested
            ? tr("settings.userDetail.approvalWasRequested")
            : tr("common.saved2"),
          message: result.data.requested
            ? tr("settings.userDetail.theAssignedSitesChangeOnceApproved")
            : tr("settings.userDetail.theAssignedSitesWereUpdated"),
          color: result.data.requested ? "blue" : "green",
        });
        router.refresh();
        onSaved();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <MultiSelect
        clearable
        data={options}
        onChange={setValue}
        placeholder={value.length === 0 ? tr("common.selectASite") : undefined}
        searchable
        value={value}
      />
      {requiresApproval && (
        <Textarea
          autosize
          description={tr("common.theApproverDecidesBasedOnWhat")}
          label={tr("settings.userDetail.reasonForTheChange")}
          minRows={2}
          mt="sm"
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr("settings.userDetail.eGChangingSitesDueTo")}
          value={reason}
          withAsterisk
        />
      )}
      <FormActions
        disabled={!dirty || (requiresApproval && !reason.trim())}
        loading={isPending}
        onCancel={onCancel}
        onSave={handleSave}
        submitLabel={
          requiresApproval
            ? tr("settings.userDetail.requestApprovalButton")
            : undefined
        }
      />
    </>
  );
}

/** 所属拠点カード — system:ADMIN は編集可、他は閲覧のみ。 */
function UserPlantsCard({
  user,
  plantOptions,
  canEdit,
  requiresApproval,
}: {
  user: AdminUserDetail;
  plantOptions: AdminUserPlant[];
  canEdit: boolean;
  /** true = 直接は変えられず、変更依頼を出して承認を待つ（管理者以外）。 */
  requiresApproval: boolean;
}) {
  const tr = useTranslations();

  const view =
    user.plants.length === 0 ? (
      <Text c="dimmed" size="sm">
        {tr("settings.userDetail.thereAreNoAssignedSites")}
      </Text>
    ) : (
      <Group gap="xs">
        {user.plants.map((p) => (
          <Badge color="blue" key={p.id} variant="light">
            {plantLabel(p)}
          </Badge>
        ))}
      </Group>
    );

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="sm" order={5}>
        {tr("settings.userDetail.assignedSites")}
      </Title>
      <Text c="dimmed" mb="sm" size="xs">
        {tr("settings.userDetail.theSitesThatSiteAndRegion")}
      </Text>
      <EditablePanel
        canEdit={canEdit}
        edit={({ close }) => (
          <UserPlantsEditor
            onCancel={close}
            onSaved={close}
            plantOptions={plantOptions}
            requiresApproval={requiresApproval}
            user={user}
          />
        )}
        view={view}
      />
    </Paper>
  );
}

export function UserDetail({
  user,
  plantOptions,
  roleOptions,
  roleGuard,
  canEditPlants,
  canEditRoles,
  requiresApproval,
  loginAttempts,
  userDevices,
}: {
  user: AdminUserDetail;
  plantOptions: AdminUserPlant[];
  roleOptions: AdminUserRole[];
  /** ロール変更のガードに要る事実（サーバーで数えたもの）。 */
  roleGuard: RoleGuardFacts;
  canEditPlants: boolean;
  canEditRoles: boolean;
  /** true = 変更依頼を出して承認を待つ（管理者以外）。 */
  requiresApproval: boolean;
  /** この人の認証イベント（成功・失敗の両方。直近 30 日）。 */
  loginAttempts: LoginAttemptRow[];
  /** この人が Web で使った端末の台帳。 */
  userDevices: UserDeviceRow[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const locale = useLocale();
  return (
    <DetailShell
      breadcrumbs={[
        tr("common.system"),
        { label: tr("common.users"), href: "/settings/users" },
      ]}
      createdAt={user.createdAt ? fmt.dateTime(user.createdAt) : undefined}
      status={<UserActiveBadge isActive={user.isActive} />}
      title={user.displayName}
      updatedAt={user.updatedAt ? fmt.dateTime(user.updatedAt) : undefined}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.username")}
          value={<Text ff="mono">{user.username}</Text>}
        />
        <FieldValue
          label={tr("common.type")}
          value={<UserGroupBadge group={user.group} />}
        />
        <FieldValue label={tr("common.email")} value={user.email ?? "—"} />
        <FieldValue
          label={tr("settings.userDetail.loginMethod")}
          value={
            user.hasPassword
              ? tr("settings.userDetail.passwordAndSso")
              : tr("settings.userDetail.sSOOnly")
          }
        />
        <FieldValue
          label={tr("common.lastLogin")}
          value={user.lastLoginAt ? fmt.dateTime(user.lastLoginAt) : "—"}
        />
        <FieldValue
          label={tr("settings.userDetail.employeeId")}
          value={
            user.employeeId ? <Text ff="mono">{user.employeeId}</Text> : "—"
          }
        />
      </SummaryGrid>

      <UserRolesCard
        canEdit={canEditRoles}
        guard={roleGuard}
        requiresApproval={requiresApproval}
        roleOptions={roleOptions}
        user={user}
      />

      <UserPlantsCard
        canEdit={canEditPlants}
        plantOptions={plantOptions}
        requiresApproval={requiresApproval}
        user={user}
      />

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("settings.userDetail.effectivePermissions")}
        </Title>
        <Text c="dimmed" mb="sm" size="xs">
          {tr("settings.userDetail.thePermissionsGrantedByTheirActive")}
        </Text>
        {user.permissions.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("settings.userDetail.youDoNotHavePermission")}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={420}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    {tr("settings.userDetail.permissionCode")}
                  </Table.Th>
                  <Table.Th>{tr("settings.userDetail.action")}</Table.Th>
                  <Table.Th>{tr("common.scope")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {user.permissions.map((p, i) => (
                  <Table.Tr
                    key={`${p.permissionCode}:${p.action}:${p.scope}:${i}`}
                  >
                    <Table.Td>
                      {/* コードだけでは何の権限か読めないので、表示名を主に出し、
                          コードは補助として下に小さく添える（問い合わせでは
                          コードで指定されることがあるため消さない）。 */}
                      <Text
                        fw={500}
                        size="sm"
                        title={permissionSummary(p.permissionCode)}
                      >
                        {permissionLabel(p.permissionCode)}
                      </Text>
                      <Text c="dimmed" ff="mono" size="xs">
                        {p.permissionCode}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        {permissionActionLabel(p.action, locale)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {permissionScopeLabel(p.scope, locale)}
                        {(p.scope === "PLANT" || p.scope === "REGION") &&
                        !(
                          p.scopeValues.length === 1 && p.scopeValues[0] === "*"
                        )
                          ? ` (${p.scopeValues.join(", ")})`
                          : ""}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* ログイン履歴 — 成功・失敗の両方。失敗が続いていれば異常に気づける。 */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("settings.userDetail.loginHistoryLast30Days")}
        </Title>
        <LoginAttemptList
          emptyMessage={tr("settings.userDetail.thereAreNoLoginRecordsIn")}
          rows={loginAttempts}
        />
      </Paper>

      {/* 登録端末 — 「いつもの端末か」の目安。端末の同定ではない。 */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("settings.userDetail.registeredDevicesWeb")}
        </Title>
        <UserDeviceList devices={userDevices} />
      </Paper>
    </DetailShell>
  );
}
