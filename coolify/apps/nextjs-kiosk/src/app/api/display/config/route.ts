/**
 * GET /api/display/config — このディスプレイが今なにを映すか。
 *
 * 表示内容は**端末の行が直接持つ**（表示内容テーブルは廃止した）。
 * ディスプレイは起動時と、WS の config_changed / revoked を受けたときに引く。
 * **失効の検知点でもある** — 401 が返ったらクライアントは再読込し、
 * サーバー側がペアリング画面を出す（Pi に触らずに再ペアリングできる）。
 *
 * METABASE のときだけ、ここで署名済みの埋め込み URL を作る。署名の材料
 * （locked パラメータ）は DB の content_config から採り、リクエストからは
 * 一切受け取らない — 受け取ると壁の画面から他拠点を覗けてしまう。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDisplay, touchDisplay } from "@/lib/display-auth";
import { parseDisplayContent } from "@/lib/display-content";
import { machineHint } from "@/lib/display-core";
import { deviceName } from "@/lib/format";
import { metabaseEmbedUrl } from "@/lib/metabase-embed";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getDisplay();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  // どの機械の何枚目か。**ここで毎回更新するのが要点** — 以前は有効化のとき
  // （confirm）にしか書いていなかったので、
  //   HDMI の口を挿し替えた / Pi を入れ替えた / ホスト名を変えた
  // のいずれでも値が古いまま残り、一覧のまとめ表示や「何枚目」が実際と
  // 食い違っていた。heartbeat も書くが、あれは **WS が張れないときだけ**
  // 動く（＝通常は動かない）ので、当てにできない。
  // config は読み込み時と再取得間隔ごとに必ず来るので、ここが確実。
  const url = new URL(req.url);
  const hint = machineHint(
    url.searchParams.get("machine"),
    url.searchParams.get("screen"),
  );
  await touchDisplay(auth.display.id, {
    ipAddress: clientIpOf(req),
    userAgent: userAgentOf(req),
    // 手掛かりが URL に無いときは触らない（既存の値を null で潰さない）
    ...(hint.machineId !== null ? { machineId: hint.machineId } : {}),
    ...(hint.screenIndex !== null ? { screenIndex: hint.screenIndex } : {}),
  });

  const row = await prisma.displayDevice.findUnique({
    where: { id: auth.display.id },
    select: {
      id: true,
      name: true,
      location: true,
      scalePercent: true,
      contentType: true,
      contentConfig: true,
      refreshIntervalSec: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const display = {
    id: auth.display.id,
    name: deviceName(row.name),
    location: row.location,
    scalePercent: auth.display.scalePercent,
  };

  const content = parseDisplayContent(row.contentType, row.contentConfig);
  if (!content) {
    // 設定が壊れている（種別と中身が食い違う）。真っ黒より、直せる人に
    // 何が起きたか伝わるほうがよい。
    return NextResponse.json({
      display,
      profile: {
        refreshIntervalSec: row.refreshIntervalSec,
        content: { type: "INVALID" as const },
      },
    });
  }

  // METABASE だけはここで署名する（トークンは短命なので毎回作り直す）。
  const resolved =
    content.type === "METABASE"
      ? { type: "METABASE" as const, url: metabaseEmbedUrl(content.config) }
      : content;

  return NextResponse.json({
    display,
    profile: {
      refreshIntervalSec: row.refreshIntervalSec,
      content: resolved,
    },
  });
}
