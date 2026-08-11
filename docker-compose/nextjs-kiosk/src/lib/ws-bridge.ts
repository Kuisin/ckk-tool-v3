/**
 * ws-bridge.ts — Next のルートハンドラから WebSocket サーバーへの橋渡し。
 *
 * WS サーバー（src/lib/ws-server.ts）はカスタムサーバーのモジュールグラフで
 * 動き、Next 側のバンドルからは import できない。同一プロセスなので
 * globalThis 経由でインスタンスを共有する（demo と同じパターン）。
 * `next dev`（WS サーバーなし）では undefined — 呼び出しは常に optional。
 */

export interface KioskWsBridge {
  /** 端末のアクティビティを通知（モニターへ device_status ブロードキャスト）。 */
  notifyActivity(deviceId: string): void;
  /** 端末状態の変更（有効化/無効化/取り消し）をモニターへ通知。 */
  notifyDeviceChanged(deviceId: string): void;
}

export function wsBridge(): KioskWsBridge | undefined {
  return (globalThis as { __kioskWs?: KioskWsBridge }).__kioskWs;
}
