"use client";

/**
 * UserDetail — ユーザー管理（SY01）の詳細。
 *
 * プロフィール概要 + ロール割当履歴（user_role_relation）+ 実効権限
 * （user_permissions ビュー = 有効ロール経由の全 grant 行）+ 所属拠点
 * （user_plants — PLANT/REGION スコープ解決の基盤）を表示する。
 * 所属拠点は system:ADMIN のみ編集可（それ以外は読み取り表示）。
 */

import {
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
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateUserPlants } from "@/app/(dashboard)/settings/users/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { LoginAttemptList } from "@/components/settings/security/LoginAttemptList";
import { UserDeviceList } from "@/components/settings/security/UserDeviceList";
import {
  UserActiveBadge,
  UserGroupBadge,
} from "@/components/settings/UsersTable";
import { SaveButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { permissionActionLabel, permissionScopeLabel } from "@/lib/enum-labels";
import { localized } from "@/lib/format";
import type { LoginAttemptRow, UserDeviceRow } from "@/lib/login-attempts";
import { permissionLabel, permissionSummary } from "@/lib/permission-labels";
import type { AdminUserDetail, AdminUserPlant } from "@/lib/users-admin";

function roleLabel(role: {
  rolename: string;
  displayName: AdminUserDetail["roles"][number]["displayName"];
}): string {
  const label = localized(role.displayName);
  return label === "—" ? role.rolename : label;
}

function plantLabel(p: AdminUserPlant): string {
  return `${p.code} ${localized(p.name)}`;
}

/** 所属拠点カード — system:ADMIN は MultiSelect で編集、他はバッジ表示。 */
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
          label: `${plantLabel(p)}（無効）`,
        });
      }
    }
    return [...byId.values()];
  }, [plantOptions, user.plants]);

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
          title: result.data.requested ? "承認を依頼しました" : "保存しました",
          message: result.data.requested
            ? "承認されると所属拠点が変更されます"
            : "所属拠点を更新しました",
          color: result.data.requested ? "blue" : "green",
        });
        setReason("");
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="sm" order={5}>
        所属拠点
      </Title>
      <Text c="dimmed" mb="sm" size="xs">
        「拠点」「地域」スコープの権限が適用される対象拠点
      </Text>
      {canEdit ? (
        <>
          <MultiSelect
            clearable
            data={options}
            onChange={setValue}
            placeholder={value.length === 0 ? "拠点を選択" : undefined}
            searchable
            value={value}
          />
          {requiresApproval && (
            <Textarea
              autosize
              description="承認者がこの内容を見て判断します"
              label="変更の理由"
              minRows={2}
              mt="sm"
              onChange={(e) => setReason(e.currentTarget.value)}
              placeholder="例: 異動のため所属拠点を変更"
              value={reason}
              withAsterisk
            />
          )}
          <Group justify="flex-end" mt="sm">
            <SaveButton
              disabled={!dirty || (requiresApproval && !reason.trim())}
              loading={isPending}
              onClick={handleSave}
              type="button"
            >
              {requiresApproval ? "承認を依頼" : undefined}
            </SaveButton>
          </Group>
        </>
      ) : user.plants.length === 0 ? (
        <Text c="dimmed" size="sm">
          所属拠点がありません
        </Text>
      ) : (
        <Group gap="xs">
          {user.plants.map((p) => (
            <Badge color="blue" key={p.id} variant="light">
              {plantLabel(p)}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  );
}

export function UserDetail({
  user,
  plantOptions,
  canEditPlants,
  requiresApproval,
  loginAttempts,
  userDevices,
}: {
  user: AdminUserDetail;
  plantOptions: AdminUserPlant[];
  canEditPlants: boolean;
  /** true = 変更依頼を出して承認を待つ（管理者以外）。 */
  requiresApproval: boolean;
  /** この人の認証イベント（成功・失敗の両方。直近 30 日）。 */
  loginAttempts: LoginAttemptRow[];
  /** この人が Web で使った端末の台帳。 */
  userDevices: UserDeviceRow[];
}) {
  const fmt = useFormat();
  return (
    <DetailShell
      breadcrumbs={[
        "システム",
        { label: "ユーザー管理", href: "/settings/users" },
      ]}
      createdAt={user.createdAt ? fmt.dateTime(user.createdAt) : undefined}
      status={<UserActiveBadge isActive={user.isActive} />}
      title={user.displayName}
      updatedAt={user.updatedAt ? fmt.dateTime(user.updatedAt) : undefined}
    >
      <SummaryGrid>
        <FieldValue
          label="ユーザー名"
          value={<Text ff="mono">{user.username}</Text>}
        />
        <FieldValue
          label="区分"
          value={<UserGroupBadge group={user.group} />}
        />
        <FieldValue label="メール" value={user.email ?? "—"} />
        <FieldValue
          label="ログイン方式"
          value={user.hasPassword ? "パスワード + SSO" : "SSO のみ"}
        />
        <FieldValue
          label="最終ログイン"
          value={user.lastLoginAt ? fmt.dateTime(user.lastLoginAt) : "—"}
        />
        <FieldValue
          label="社員 ID"
          value={
            user.employeeId ? <Text ff="mono">{user.employeeId}</Text> : "—"
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          ロール割当
        </Title>
        {user.assignments.length === 0 ? (
          <Text c="dimmed" size="sm">
            ロールが割り当てられていません
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ロール</Table.Th>
                  <Table.Th>rolename</Table.Th>
                  <Table.Th>状態</Table.Th>
                  <Table.Th>割当日</Table.Th>
                  <Table.Th>解除日時</Table.Th>
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
        )}
      </Paper>

      <UserPlantsCard
        canEdit={canEditPlants}
        plantOptions={plantOptions}
        requiresApproval={requiresApproval}
        user={user}
      />

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          実効権限
        </Title>
        <Text c="dimmed" mb="sm" size="xs">
          有効なロールから与えられている許可の一覧（この人ができることは、下の行すべての合計です）
        </Text>
        {user.permissions.length === 0 ? (
          <Text c="dimmed" size="sm">
            権限がありません
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={420}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>権限コード</Table.Th>
                  <Table.Th>アクション</Table.Th>
                  <Table.Th>スコープ</Table.Th>
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
                        {permissionActionLabel(p.action)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {permissionScopeLabel(p.scope)}
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
          ログイン履歴（直近 30 日）
        </Title>
        <LoginAttemptList
          emptyMessage="この期間のログイン記録はありません"
          rows={loginAttempts}
        />
      </Paper>

      {/* 登録端末 — 「いつもの端末か」の目安。端末の同定ではない。 */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          登録端末（Web）
        </Title>
        <UserDeviceList devices={userDevices} />
      </Paper>
    </DetailShell>
  );
}
