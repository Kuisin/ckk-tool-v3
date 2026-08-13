/**
 * connection-status.ts — ヘッダー右上の接続インジケータの状態解決（純関数）。
 *
 * 色の意味（DC01 マニュアル「キオスク端末セットアップ」に凡例あり）:
 *   灰   = 接続なし（サーバーに到達できない。インターネット不要 — 判定は
 *          この URL 自身への疎通で行うため LAN 内でも正しく動く）
 *   赤   = サーバーには繋がるが端末が未登録（未リンク）
 *   橙   = 登録済みだが通常ブラウザで利用中（専用アプリのハードウェア鍵なし）
 *   緑   = 専用アプリ（ハードウェア鍵）で接続中
 *   橙/緑の点滅 = 接続が不安定（直近に疎通失敗や WS 切断があった）
 */

export type ConnectionLevel = "gray" | "red" | "orange" | "green";

export type IndicatorState = {
  level: ConnectionLevel;
  blinking: boolean;
  /** ツールチップ表示用（日本語固定 — ヘッダーは全画面共通のため）。 */
  label: string;
};

export type IndicatorInput = {
  /** navigator.onLine（false = OS がネットワーク断と報告） */
  online: boolean;
  /** サーバー疎通 OK（/api/healthz プローブが連続失敗していない） */
  serverReachable: boolean;
  /** 端末が登録（リンク）済みか */
  registered: boolean;
  /** window.KioskDevice ブリッジあり（= 専用アプリ内） */
  hasBridge: boolean;
  /** 直近に疎通失敗・WS 切断があった（現在は疎通ありでも不安定扱い） */
  unstable: boolean;
};

export function resolveIndicator(input: IndicatorInput): IndicatorState {
  if (!input.online || !input.serverReachable) {
    return { level: "gray", blinking: false, label: "接続なし" };
  }
  if (!input.registered) {
    return { level: "red", blinking: false, label: "端末未登録" };
  }
  const unstableSuffix = input.unstable ? "・接続不安定" : "";
  if (input.hasBridge) {
    return {
      level: "green",
      blinking: input.unstable,
      label: `専用アプリで接続中${unstableSuffix}`,
    };
  }
  return {
    level: "orange",
    blinking: input.unstable,
    label: `ブラウザで接続中（専用アプリ未使用）${unstableSuffix}`,
  };
}

export const INDICATOR_COLOR: Record<ConnectionLevel, string> = {
  gray: "var(--mantine-color-gray-6)",
  red: "var(--mantine-color-red-6)",
  orange: "var(--mantine-color-orange-5)",
  green: "var(--mantine-color-green-5)",
};
