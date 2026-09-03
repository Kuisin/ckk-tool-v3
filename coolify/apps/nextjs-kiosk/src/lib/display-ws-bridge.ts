/**
 * display-ws-bridge.ts — ルートハンドラ / サーバーアクションから
 * ディスプレイ WS サーバーへの橋渡し。
 *
 * ws-bridge.ts と同じ理由で globalThis を経由する（WS サーバーは
 * カスタムサーバー側のモジュールグラフに居て、Next のバンドルからは
 * import できない）。`next dev` では undefined になるので、
 * **呼び出しは必ず optional chaining** で書くこと。
 */

export interface DisplayWsBridge {
  /** 表示内容が変わったので設定を引き直せ、と 1 台へ伝える。 */
  notifyConfigChanged(displayId: string): void;
  /** 失効した（Cookie を捨ててペアリング画面へ戻れ）と 1 台へ伝える。 */
  notifyRevoked(displayId: string): void;
  /** 死活・素性が変わったのでモニター（管理 UI）へ配信し直す。 */
  notifyDisplayChanged(displayId: string): void;
}

export function displayWsBridge(): DisplayWsBridge | undefined {
  return (globalThis as { __displayWs?: DisplayWsBridge }).__displayWs;
}
