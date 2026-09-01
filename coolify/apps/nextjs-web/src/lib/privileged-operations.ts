/**
 * privileged-operations.ts — 時限昇格（方式 A）で申請できる操作の登録簿。
 *
 * 「権限コード」と「操作」は別の粒度で、役割が違う:
 *   コード（kiosk_card 等）… **誰が申請でき、誰が承認できるか**を決める。RBAC 側。
 *   操作（kiosk_card.issue）… **承認 1 件が実際に何を解錠するか**を決める。
 *
 * 申請者はコードを選び、その中の操作をいくつか選ぶ。承認者は要求された操作の
 * 一部だけを許可できる（「PIN のリセットは良いがカードの失効は駄目」を、
 * 却下せずに表現するため）。だから「カード管理を触れる」ではなく
 * 「カードを発行する」「カードを失効する」の粒度で並べてある。
 *
 * ここが唯一の登録簿 — 申請フォームの選択肢も、承認画面の一覧も、各呼び出し口の
 * ゲートも同じ配列を読む。片方だけ増える事故を起こさないため、新しい特権操作を
 * 足すときは (1) ここに 1 行、(2) 呼び出し口で useElevation(key) の 1 行、で終わる。
 *
 * 純データ（I/O なし）— サーバーからもクライアントからも import してよい。
 */

import type { PermissionAction } from "@ckk/authz-core";
import type { LocalizedLabel } from "@/lib/permission-labels";
import { localizedLabel } from "./messages";

/** 時限昇格を使う権限コード（方式 A）。user_admin は方式 B なので含まない。 */
export const ELEVATION_CODES = [
  "kiosk_secret",
  "kiosk_device",
  "kiosk_card",
  "personal_data",
  "portal_admin",
] as const;

export type ElevationCode = (typeof ELEVATION_CODES)[number];

export function isElevationCode(v: string): v is ElevationCode {
  return (ELEVATION_CODES as readonly string[]).includes(v);
}

/** コードの表示名（申請フォームの「対象」選択肢）。 */
export const ELEVATION_CODE_LABEL: Record<ElevationCode, LocalizedLabel> = {
  kiosk_secret: localizedLabel(
    "privilegedOp.ELEVATION_CODE_LABEL.kiosk_secret",
  ),
  kiosk_device: localizedLabel(
    "privilegedOp.ELEVATION_CODE_LABEL.kiosk_device",
  ),
  portal_admin: localizedLabel(
    "privilegedOp.ELEVATION_CODE_LABEL.portal_admin",
  ),
  kiosk_card: localizedLabel("privilegedOp.ELEVATION_CODE_LABEL.kiosk_card"),
  personal_data: localizedLabel(
    "privilegedOp.ELEVATION_CODE_LABEL.personal_data",
  ),
};

export interface PrivilegedOperation {
  /** `<code>.<動詞>`。DB の privileged_access_request_operations.operation に入る値。 */
  key: string;
  code: ElevationCode;
  /** 申請するのに要る RBAC アクション（decide(code, action)）。 */
  action: PermissionAction;
  /** 表示名（ja が原本 — permission-labels.ts と同じ約束）。 */
  label: LocalizedLabel;
  /** 「これで何ができるようになるか」。承認者が判断するための 1 文。 */
  description: LocalizedLabel;
  /** app-list.ts のキー。申請フォームのグルーピングと導線に使う。 */
  appKey: string;
}

/**
 * 昇格が要る操作の全量（23 件）。
 *
 * ここに**無い**操作は従来どおり素の権限で通る。境界は「アクセスや秘密が動くか」:
 *   入っている … PIN を見る / 端末を入れる / カードを配る / 個人データを横断で読む
 *   入っていない … 一覧と詳細の閲覧、端末の名称・拠点の変更、フロアマップのピン、
 *                  カードの一時停止と再開（停止はアクセスを減らす操作なので、
 *                  承認を待たせるほうが危ない）
 */
export const PRIVILEGED_OPERATIONS: readonly PrivilegedOperation[] = [
  // ── kiosk_secret（SY09 端末管理の「秘密」側）─────────────────────────────
  {
    key: "kiosk_secret.reveal_unlock_pin",
    code: "kiosk_secret",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_unlock_pin.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_unlock_pin.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_pin_history",
    code: "kiosk_secret",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_pin_history.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_pin_history.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_device_pin",
    code: "kiosk_secret",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_device_pin.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_device_pin.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_settings_code",
    code: "kiosk_secret",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_settings_code.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reveal_settings_code.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.regenerate_settings_code",
    code: "kiosk_secret",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.regenerate_settings_code.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.regenerate_settings_code.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reset_device_key",
    code: "kiosk_secret",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reset_device_key.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_secret.reset_device_key.description",
    ),
    appKey: "kiosk-devices",
  },

  // ── kiosk_device（SY09 端末管理の「アクセス」側）─────────────────────────
  {
    key: "kiosk_device.create_profile",
    code: "kiosk_device",
    action: "CREATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.create_profile.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.create_profile.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.link",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.link.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.link.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.activate",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.activate.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.activate.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.set_enabled",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.set_enabled.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.set_enabled.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.unlink",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.unlink.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.unlink.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.revoke",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.revoke.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.revoke.description",
    ),
    appKey: "kiosk-devices",
  },

  // ── kiosk_device（SY09 端末管理の「ディスプレイ」タブ）──────────────────
  // 一覧・名称変更・表示内容の切替は素の `kiosk` で足りる。ここに入れているのは
  // 「画面を 1 枚増やす／取り上げる」— どちらも業務データが出る場所そのものを
  // 変える操作なので、もう 1 人の目を通す。
  {
    key: "kiosk_device.pair_display",
    code: "kiosk_device",
    action: "CREATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.pair_display.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.pair_display.description",
    ),
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.revoke_display",
    code: "kiosk_device",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.revoke_display.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_device.revoke_display.description",
    ),
    appKey: "kiosk-devices",
  },

  // ── kiosk_card（SY08 QRカード管理）───────────────────────────────────────
  {
    key: "kiosk_card.issue",
    code: "kiosk_card",
    action: "CREATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.issue.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.issue.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.assign",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.assign.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.assign.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.revoke",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.revoke.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.revoke.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.reset_pin",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.reset_pin.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.reset_pin.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.unlock_pin",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.unlock_pin.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.unlock_pin.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.update_validity",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.update_validity.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.update_validity.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.update_session_limit",
    code: "kiosk_card",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.update_session_limit.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.update_session_limit.description",
    ),
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.print",
    code: "kiosk_card",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.print.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.kiosk_card.print.description",
    ),
    appKey: "kiosk-cards",
  },

  // ── personal_data（SY0D ログイン履歴 / SY07 操作履歴）────────────────────
  {
    key: "personal_data.login_history_detail",
    code: "personal_data",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.login_history_detail.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.login_history_detail.description",
    ),
    appKey: "login-history",
  },
  {
    key: "personal_data.activity_search",
    code: "personal_data",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.activity_search.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.activity_search.description",
    ),
    appKey: "activity-log",
  },
  {
    key: "personal_data.activity_detail",
    code: "personal_data",
    action: "READ",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.activity_detail.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.personal_data.activity_detail.description",
    ),
    appKey: "activity-log",
  },

  // ── portal_admin（SY0H 取引先ポータル）─────────────────────────────────────
  //
  // ゲートするのは「社外の人がアクセスできるようになる」操作だけ。
  // 一覧の閲覧・表示名の編集・**無効化**・リンクの失効・VERIFY リンクの発行は
  // 素の portal_admin で足りる（アクセスを減らす操作を承認待ちにしない、
  // というキオスクのカード一時停止と同じ判断）。
  {
    key: "portal_admin.activate_account",
    code: "portal_admin",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.activate_account.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.activate_account.description",
    ),
    appKey: "portal-admin",
  },
  {
    key: "portal_admin.issue_backup_codes",
    code: "portal_admin",
    action: "UPDATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.issue_backup_codes.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.issue_backup_codes.description",
    ),
    appKey: "portal-admin",
  },
  {
    key: "portal_admin.mint_link_only",
    code: "portal_admin",
    action: "CREATE",
    label: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.mint_link_only.label",
    ),
    description: localizedLabel(
      "privilegedOp.PRIVILEGED_OPERATIONS.portal_admin.mint_link_only.description",
    ),
    appKey: "portal-admin",
  },
];

const BY_KEY = new Map(PRIVILEGED_OPERATIONS.map((o) => [o.key, o]));

/** 未知のキーは null（登録簿に無い = 昇格の対象ではない、を呼び出し側で扱えるように）。 */
export function findOperation(key: string): PrivilegedOperation | null {
  return BY_KEY.get(key) ?? null;
}

/** そのコードで申請できる操作（申請フォームのチェックボックス一覧）。 */
export function operationsForCode(
  code: ElevationCode,
): readonly PrivilegedOperation[] {
  return PRIVILEGED_OPERATIONS.filter((o) => o.code === code);
}

/** 操作キー → 権限コード。未知なら null。 */
export function codeForOperation(key: string): ElevationCode | null {
  return findOperation(key)?.code ?? null;
}

/** 表示用（承認画面・履歴）。未知のキーはキーをそのまま出す — 空白より読める。 */
export function operationLabel(
  key: string,
  locale: "ja" | "en" = "ja",
): string {
  const op = findOperation(key);
  return op ? op.label[locale] : key;
}
