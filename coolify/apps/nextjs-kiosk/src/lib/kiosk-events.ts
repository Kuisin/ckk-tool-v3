/**
 * kiosk-events.ts — 共有端末宛の合図（Postgres LISTEN/NOTIFY）。
 *
 * display-events.ts の端末版。管理画面（nextjs-web の SY09）が端末を
 * 取り消し / 無効化 / リンク解除 / 鍵リセットした瞬間に、この WS サーバーが
 * その端末のソケットを閉じるための経路。閉じないと端末は繋いだまま
 * 30s ごとに last_activity_at を刻み続け、止めたはずの端末が「オンライン」
 * のまま残る。
 *
 * 送り手は nextjs-web の lib/kiosk-events.ts `notifyKioskDeviceRevoked`。
 * **チャネル名とペイロードの形は両アプリで揃えること**（片方だけ変えると
 * 合図が黙って届かなくなる — ws-db.ts touchConnectedDevices が ACTIVE 以外を
 * 刻まないので 5 分窓で追いつくが、「遅いだけ」に見えて原因が分かりにくい）。
 *
 *   **ペイロードは合図であって中身ではない。** 誰の何が変わったかだけを
 *   載せ、端末側は次の upgrade 認証（ACTIVE + 期限内 + attest）で自然に弾かれる。
 *
 * ※ Next 依存なし（カスタムサーバー tsconfig.server.json からコンパイルされる）。
 */

export const KIOSK_CHANNEL = "ckk_kiosk";

export type KioskEvent = {
  deviceId: string;
  /** revoked = 端末の信頼が失われた（ソケットを閉じてプレゼンスから外す） */
  kind: "revoked";
};

export function encodeKioskEvent(event: KioskEvent): string {
  return JSON.stringify(event);
}

/** 未検証の payload を KioskEvent にする。壊れていれば null。 */
export function decodeKioskEvent(payload: string): KioskEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<KioskEvent>;
    if (typeof parsed.deviceId !== "string" || !parsed.deviceId) return null;
    if (parsed.kind !== "revoked") return null;
    return { deviceId: parsed.deviceId, kind: parsed.kind };
  } catch {
    return null;
  }
}
