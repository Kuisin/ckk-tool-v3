/**
 * POST /api/device-signals — 端末シグネチャの受け取り（**未ログインで叩ける**）。
 *
 * ログイン画面が集めた生シグネチャを受け取り、サーバー側で正規化 + ハッシュして
 * 署名 Cookie（ckk_dev / SameSite=Lax / 10分）に載せる。credentials の同一サイト
 * POST でも、Authentik から戻るトップレベル GET でも Cookie が送られるので、
 * これ 1 本で両方のログイン経路をまかなえる。
 *
 * ⚠️ このパスは proxy.ts の matcher から除外してある。除外し忘れると未ログインの
 * POST が /login へ 307 され、機能が**無言で死ぬ**。
 *
 * クライアントが送るのは生シグネチャだけで、ハッシュは受け取らない
 * （理由は device-signals-core.ts 冒頭）。
 */

import { NextResponse } from "next/server";
import {
  computeSignals,
  DEVICE_SIGNALS_COOKIE,
  DEVICE_SIGNALS_TTL_MS,
  mintSignalsCookie,
} from "@/lib/device-signals";

/** 悪意ある巨大ボディを読み込まないための上限。 */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const raw = await req.json().catch(() => null);
  const { version, fingerprint, normalized } = computeSignals(raw);
  const cookie = mintSignalsCookie(version, fingerprint, normalized);

  const res = NextResponse.json({ ok: true });
  if (cookie) {
    res.cookies.set(DEVICE_SIGNALS_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(DEVICE_SIGNALS_TTL_MS / 1000),
    });
  }
  return res;
}

export const dynamic = "force-dynamic";
