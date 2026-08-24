/**
 * sound.ts — キオスクの操作音（WebAudio 合成 — 音源ファイル・依存なし）。
 *
 * - ログイン成功: 上昇 2 音（ピポッ）
 * - ログアウト: 下降 2 音（ポピッ）
 * - 自動ログアウト警告開始: 高音 2 連（ピッピッ）
 *
 * 専用アプリの WebView は mediaPlaybackRequiresUserGesture=false のため常に鳴る。
 * 通常ブラウザは自動再生制限により初回タップまで無音のことがある（許容）。
 */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null; // 非対応環境では黙ってスキップ
  }
}

/** 単音をスケジュールする（startMs 後に durMs 鳴らす）。 */
function tone(
  ac: AudioContext,
  freq: number,
  startMs: number,
  durMs: number,
  gain = 0.12,
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + startMs / 1000;
  const t1 = t0 + durMs / 1000;
  osc.type = "sine";
  osc.frequency.value = freq;
  // クリックノイズ防止のフェードイン/アウト
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.setValueAtTime(gain, t1 - 0.02);
  g.gain.linearRampToValueAtTime(0, t1);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t1 + 0.01);
}

/** QR ログイン成功。 */
export function playLoginSound() {
  const ac = audioCtx();
  if (!ac) return;
  tone(ac, 660, 0, 90);
  tone(ac, 990, 100, 140);
}

/** ログアウト（手動・自動とも）。 */
export function playLogoutSound() {
  const ac = audioCtx();
  if (!ac) return;
  tone(ac, 660, 0, 90);
  tone(ac, 440, 100, 160);
}

/** 自動ログアウトの警告カウントダウン開始。 */
export function playWarnSound() {
  const ac = audioCtx();
  if (!ac) return;
  tone(ac, 880, 0, 80);
  tone(ac, 880, 160, 80);
}
