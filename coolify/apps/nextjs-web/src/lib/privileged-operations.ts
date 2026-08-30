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

/** 時限昇格を使う権限コード（方式 A）。user_admin は方式 B なので含まない。 */
export const ELEVATION_CODES = [
  "kiosk_secret",
  "kiosk_device",
  "kiosk_card",
  "personal_data",
] as const;

export type ElevationCode = (typeof ELEVATION_CODES)[number];

export function isElevationCode(v: string): v is ElevationCode {
  return (ELEVATION_CODES as readonly string[]).includes(v);
}

/** コードの表示名（申請フォームの「対象」選択肢）。 */
export const ELEVATION_CODE_LABEL: Record<
  ElevationCode,
  { ja: string; en: string }
> = {
  kiosk_secret: {
    ja: "キオスク端末の秘密",
    en: "Kiosk device secrets",
  },
  kiosk_device: {
    ja: "端末アクセスの付与",
    en: "Kiosk device enrolment",
  },
  kiosk_card: { ja: "QRカードの発行・PIN", en: "Kiosk card issuance" },
  personal_data: { ja: "個人データの閲覧", en: "Personal data access" },
};

export interface PrivilegedOperation {
  /** `<code>.<動詞>`。DB の privileged_access_request_operations.operation に入る値。 */
  key: string;
  code: ElevationCode;
  /** 申請するのに要る RBAC アクション（decide(code, action)）。 */
  action: PermissionAction;
  label: { ja: string; en: string };
  /** 「これで何ができるようになるか」。承認者が判断するための 1 文。 */
  description: { ja: string; en: string };
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
    label: { ja: "メンテナンス退出 PIN の表示", en: "Reveal maintenance PIN" },
    description: {
      ja: "全端末共通の退出 PIN を平文で表示する。これを知っている人はどの端末でもキオスクから抜けて Android 設定へ入れる",
      en: "Shows the shared maintenance-exit PIN in clear text. It exits kiosk mode on every device.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_pin_history",
    code: "kiosk_secret",
    action: "READ",
    label: { ja: "PIN 履歴の表示", en: "Reveal PIN history" },
    description: {
      ja: "過去 400 日ぶんの退出 PIN を一覧で表示する。オフラインの端末は古い PIN を保持しているため必要になるが、範囲は現行値より広い",
      en: "Lists up to 400 days of past exit PINs — needed for offline devices, but broader than the current value.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_device_pin",
    code: "kiosk_secret",
    action: "READ",
    label: {
      ja: "端末が保持している PIN の表示",
      en: "Reveal the PIN a device holds",
    },
    description: {
      ja: "その端末に最後に渡した退出 PIN を表示する。オフラインの端末を開けるときに使う",
      en: "Shows the exit PIN last delivered to that device — used to open an offline tablet.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reveal_settings_code",
    code: "kiosk_secret",
    action: "READ",
    label: { ja: "端末設定コードの表示", en: "Reveal device settings code" },
    description: {
      ja: "その端末の設定画面（左上 5 タップ）を解錠するコードを表示する",
      en: "Shows the code that unlocks that device's hidden settings screen.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.regenerate_settings_code",
    code: "kiosk_secret",
    action: "UPDATE",
    label: {
      ja: "端末設定コードの再生成",
      en: "Regenerate device settings code",
    },
    description: {
      ja: "設定コードを作り直す。現地に居る人が古いコードで入れなくなる",
      en: "Issues a new settings code; anyone holding the old one loses access.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_secret.reset_device_key",
    code: "kiosk_secret",
    action: "UPDATE",
    label: { ja: "端末鍵のリセット", en: "Reset device attestation key" },
    description: {
      ja: "アテステーション鍵の紐付けを外し、次に繋いだ端末を無条件に信頼し直す（TOFU）。端末を入れ替えたときだけ使う",
      en: "Clears the attestation binding so the next device to connect is trusted (TOFU). Only for hardware replacement.",
    },
    appKey: "kiosk-devices",
  },

  // ── kiosk_device（SY09 端末管理の「アクセス」側）─────────────────────────
  {
    key: "kiosk_device.create_profile",
    code: "kiosk_device",
    action: "CREATE",
    label: { ja: "端末プロファイルの作成", en: "Create device profile" },
    description: {
      ja: "新しい端末の枠を作る。ここにリンクした端末が現場でログイン画面を出せるようになる",
      en: "Creates the slot a new tablet can be linked into.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.link",
    code: "kiosk_device",
    action: "UPDATE",
    label: { ja: "端末のリンク", en: "Link a device" },
    description: {
      ja: "実機をプロファイルへ紐付ける。端末トークンが発行され、その端末がシステムに入る",
      en: "Binds real hardware to a profile and issues its device token.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.activate",
    code: "kiosk_device",
    action: "UPDATE",
    label: { ja: "端末の有効化", en: "Activate a device" },
    description: {
      ja: "リンク済みの端末を稼働させる。これ以降その端末で従業員がログインできる",
      en: "Brings a linked device into service so employees can log in on it.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.set_enabled",
    code: "kiosk_device",
    action: "UPDATE",
    label: { ja: "端末の停止 / 再開", en: "Disable / enable a device" },
    description: {
      ja: "端末を一時的に止める、または止めていた端末を戻す",
      en: "Suspends a device or brings a suspended one back.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.unlink",
    code: "kiosk_device",
    action: "UPDATE",
    label: { ja: "リンク解除", en: "Unlink a device" },
    description: {
      ja: "端末トークン・セッション・アテステーション鍵を破棄してプロファイルを空に戻す。名称と拠点は残る",
      en: "Destroys the device token, sessions and attestation key, reopening the profile.",
    },
    appKey: "kiosk-devices",
  },
  {
    key: "kiosk_device.revoke",
    code: "kiosk_device",
    action: "UPDATE",
    label: { ja: "端末の失効", en: "Revoke a device" },
    description: {
      ja: "その端末を即座に締め出す。現場で作業中のセッションも切れる",
      en: "Locks the device out immediately, cutting live shop-floor sessions.",
    },
    appKey: "kiosk-devices",
  },

  // ── kiosk_card（SY08 QRカード管理）───────────────────────────────────────
  {
    key: "kiosk_card.issue",
    code: "kiosk_card",
    action: "CREATE",
    label: { ja: "カードの発行", en: "Issue cards" },
    description: {
      ja: "新しい QR カードを発行する。QR の中身は認証情報そのもので、刷った紙がそのまま鍵になる",
      en: "Creates new QR cards. The QR payload is the credential itself.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.assign",
    code: "kiosk_card",
    action: "UPDATE",
    label: { ja: "カードの割当・付け替え", en: "Assign / reassign a card" },
    description: {
      ja: "カードを従業員に紐付ける。付け替えると、そのカードで入った操作は新しい人の名前で記録される",
      en: "Binds a card to an employee. After reassignment, actions are recorded under the new person.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.revoke",
    code: "kiosk_card",
    action: "UPDATE",
    label: { ja: "カードの失効", en: "Revoke a card" },
    description: {
      ja: "カードを使えなくする。紛失時の正しい操作だが、取り消せない",
      en: "Permanently disables a card — correct for a lost card, and irreversible.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.reset_pin",
    code: "kiosk_card",
    action: "UPDATE",
    label: { ja: "PIN のリセット", en: "Reset a card PIN" },
    description: {
      ja: "PIN を未設定に戻し、次のログインで本人に決め直させる。忘れた本人以外が実行すると乗っ取りになりうる",
      en: "Clears the PIN so it is set again at next login. In the wrong hands this is account takeover.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.unlock_pin",
    code: "kiosk_card",
    action: "UPDATE",
    label: { ja: "PIN ロックの解除", en: "Release a PIN lockout" },
    description: {
      ja: "5 回失敗して掛かった 15 分のロックを即座に外す",
      en: "Clears the 15-minute lockout caused by five failed PIN attempts.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.update_validity",
    code: "kiosk_card",
    action: "UPDATE",
    label: { ja: "有効期間の変更", en: "Change card validity" },
    description: {
      ja: "カードが使える期間を変える。伸ばせば期限切れのカードが復活する",
      en: "Changes how long a card works; extending it revives an expired card.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.update_session_limit",
    code: "kiosk_card",
    action: "UPDATE",
    label: {
      ja: "同時セッション上限の変更",
      en: "Change concurrent session limit",
    },
    description: {
      ja: "1 枚のカードで同時に開けるセッション数を変える。増やすと貸し借りが見えなくなる",
      en: "Changes how many sessions one card may hold at once; raising it hides card sharing.",
    },
    appKey: "kiosk-cards",
  },
  {
    key: "kiosk_card.print",
    code: "kiosk_card",
    action: "READ",
    label: { ja: "カード台紙の PDF 出力", en: "Print the card sheet" },
    description: {
      ja: "QR を印刷用 PDF に出す。ダウンロードした時点で認証情報がファイルとして手元に残る",
      en: "Renders the QR codes into a printable PDF — the credential leaves the system as a file.",
    },
    appKey: "kiosk-cards",
  },

  // ── personal_data（SY0D ログイン履歴 / SY07 操作履歴）────────────────────
  {
    key: "personal_data.login_history_detail",
    code: "personal_data",
    action: "READ",
    label: { ja: "ログイン履歴の詳細", en: "Login history detail" },
    description: {
      ja: "1 件の認証イベントの IP・端末シグネチャ・所有区分まで開く。従業員監視に隣接する情報",
      en: "Opens one auth event down to IP, device signature and ownership — adjacent to employee monitoring.",
    },
    appKey: "login-history",
  },
  {
    key: "personal_data.activity_search",
    code: "personal_data",
    action: "READ",
    label: { ja: "操作履歴の横断検索", en: "Cross-document activity search" },
    description: {
      ja: "書類をまたいで「この人が何をしたか」を検索する。書類ごとの履歴タブはこの権限では制限しない",
      en: "Searches what one person did across all documents. Per-document history tabs are not restricted by this.",
    },
    appKey: "activity-log",
  },
  {
    key: "personal_data.activity_detail",
    code: "personal_data",
    action: "READ",
    label: { ja: "操作履歴の詳細", en: "Activity log detail" },
    description: {
      ja: "1 件の操作の変更前後（before / after）まで開く",
      en: "Opens one operation down to its before/after payload.",
    },
    appKey: "activity-log",
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
