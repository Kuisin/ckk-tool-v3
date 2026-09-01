"use client";

/**
 * screen-slot.ts — **同じブラウザで開いている画面を自動で数える**。
 *
 * 普通のパソコンで多画面にするには、窓ごとに `?screen=` を付ける必要があった。
 * 現場に URL を手で書かせるのは無理があるので、**窓を開くだけで空いている
 * 番号を自分で取る**ようにする。
 *
 * 仕組みは **Web Locks**（`navigator.locks`）。同じプロファイルのタブ・窓の間で
 * 共有される名前つきの錠で、
 *   - 取れた = その番号は空いていた
 *   - 窓を閉じると自動で外れる（後片付けが要らない）
 * という性質が、そのまま「何枚目か」の割り当てに使える。localStorage の
 * 手作りの取り合いだと、閉じ方によって印が残って番号が埋まったままになる。
 *
 * ## できないこと（正直に）
 *
 * **どの窓がどの物理モニタに出ているかは分からない。** 分かるのは「何番目に
 * 開かれたか」だけ。左右を決め打ちしたいときは、これまでどおり `?screen=` を
 * 明示すること（明示が常に優先される）。
 *
 * Web Locks が無いブラウザでは 1 枚目として振る舞う（従来と同じ挙動）。
 */

import { SCREEN_INDEX_MAX } from "./display-core";

/** 錠の名前。1 枚 = 1 つの錠。 */
export function slotLockName(index: number): string {
  return `ckk-display-screen-${index}`;
}

export interface ScreenSlot {
  /** 何枚目として振る舞うか（1 始まり）。 */
  index: number;
  /** いま開いている画面の総数（自分を含む）。 */
  total: number;
  /** 自動で決めたか（false = URL の指定に従った / 判定できなかった）。 */
  auto: boolean;
}

/** この窓が掴んだ錠を離さないための保持（ページが生きている間ずっと）。 */
let held: { index: number; release: () => void } | null = null;

/**
 * 空いている番号を 1 つ取る。**取った錠はページが閉じるまで離さない。**
 *
 * `preferred` が指定されていれば、その番号を取りに行く（URL の指定が優先）。
 * 取れなくてもその番号で振る舞う — 明示された指定を勝手に変えない。
 */
export async function claimScreenSlot(
  preferred: number | null,
): Promise<ScreenSlot> {
  const locks = navigator.locks;
  // Web Locks が無い（古いブラウザ）: 従来どおり 1 枚目として動く
  if (!locks) {
    return { index: preferred ?? 1, total: 1, auto: false };
  }

  // 既に取っていれば数え直すだけ（再入しても番号が動かない）
  const takeAndHold = async (index: number): Promise<boolean> => {
    if (held) return held.index === index;
    return new Promise<boolean>((resolve) => {
      locks
        .request(slotLockName(index), { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return; // 誰かが使っている
          }
          // ページが生きている間ずっと握る。閉じれば自動で外れる。
          return new Promise<void>((release) => {
            held = { index, release: () => release() };
            resolve(true);
          });
        })
        .catch(() => resolve(false));
    });
  };

  let index = preferred ?? 0;
  let auto = false;
  if (preferred !== null) {
    await takeAndHold(preferred); // 取れなくても preferred で振る舞う
  } else {
    auto = true;
    index = 1;
    for (let i = 1; i <= SCREEN_INDEX_MAX; i++) {
      if (await takeAndHold(i)) {
        index = i;
        break;
      }
      // 全部埋まっていたら 1 枚目として振る舞う（映らないより良い）
      index = i === SCREEN_INDEX_MAX ? 1 : index;
    }
  }

  return { index, total: await countHeldSlots(), auto };
}

/**
 * いま握られている画面の錠の数 = 開いている画面の数。
 *
 * `query()` は同じプロファイルの全タブぶんを返す。使えないブラウザでは
 * 1 とみなす（総数は見出しの「1/2 枚目」に出すだけなので、外れても害は小さい）。
 */
export async function countHeldSlots(): Promise<number> {
  const locks = navigator.locks;
  if (!locks?.query) return 1;
  try {
    const state = await locks.query();
    const mine = (state.held ?? []).filter((l) =>
      (l.name ?? "").startsWith("ckk-display-screen-"),
    );
    return Math.max(1, mine.length);
  } catch {
    return 1;
  }
}
