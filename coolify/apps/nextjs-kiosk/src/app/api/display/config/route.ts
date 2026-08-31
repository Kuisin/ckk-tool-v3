/**
 * GET /api/display/config — このディスプレイが今なにを映すか。
 *
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

  await touchDisplay(auth.display.id, {
    ipAddress: clientIpOf(req),
    userAgent: userAgentOf(req),
  });

  const row = await prisma.displayDevice.findUnique({
    where: { id: auth.display.id },
    select: {
      id: true,
      name: true,
      location: true,
      profile: {
        select: {
          id: true,
          name: true,
          contentType: true,
          contentConfig: true,
          refreshIntervalSec: true,
          isEnabled: true,
        },
      },
    },
  });

  const profile = row?.profile;
  // 未割当・無効化されたプロファイルは「割り当て無し」と同じ扱い。
  // 画面は黒くせず「表示内容が設定されていません」を出す。
  if (!profile || !profile.isEnabled) {
    return NextResponse.json({
      display: {
        id: auth.display.id,
        name: deviceName(row?.name ?? null),
        location: row?.location ?? null,
      },
      profile: null,
    });
  }

  const content = parseDisplayContent(
    profile.contentType,
    profile.contentConfig,
  );
  if (!content) {
    // 設定が壊れている（種別と中身が食い違う）。真っ黒より、直せる人に
    // 何が起きたか伝わるほうがよい。
    return NextResponse.json({
      display: {
        id: auth.display.id,
        name: deviceName(row?.name ?? null),
        location: row?.location ?? null,
      },
      profile: {
        id: profile.id,
        name: deviceName(profile.name),
        refreshIntervalSec: profile.refreshIntervalSec,
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
    display: {
      id: auth.display.id,
      name: deviceName(row?.name ?? null),
      location: row?.location ?? null,
    },
    profile: {
      id: profile.id,
      name: deviceName(profile.name),
      refreshIntervalSec: profile.refreshIntervalSec,
      content: resolved,
    },
  });
}
