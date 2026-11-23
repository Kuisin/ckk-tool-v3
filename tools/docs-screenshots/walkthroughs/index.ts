/**
 * index.ts — ウォークスルーの登録簿。**並び順が実行順**（workers 1 で上から走る）。
 *
 * 5 本は互いに独立で、それぞれシード直後のデータから始める（前の 1 本が作った書類を
 * 次の 1 本が使うことはない）。1 本だけ撮り直せるようにするためと、途中の 1 本が
 * 落ちたときに後ろの全部が巻き添えで落ちないようにするため。
 */

import { billing } from "./billing";
import { production } from "./production";
import { purchasing } from "./purchasing";
import { sales } from "./sales";
import { shipping } from "./shipping";
import type { Walkthrough } from "./types";

export const walkthroughs: Walkthrough[] = [sales, purchasing, production, shipping, billing];
