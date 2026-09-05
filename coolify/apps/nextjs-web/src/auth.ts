/**
 * auth.ts — Auth.js v5 設定（Authentik OIDC + credentials）。
 *
 * Authentik は http（非 https）IdP のため、標準 OIDC provider では id_token 署名検証の
 * JWKS 取得が http 拒否されコールバックが失敗する。そこで **OAuth2** provider として
 * 定義し（type:"oauth"・nonce なし）id_token/JWKS 検証を回避、userinfo からプロフィール
 * を取得する（下記 authentikProvider のコメント参照）。env は AUTH_AUTHENTIK_ID/_SECRET/
 * _ISSUER。サインインは Server Action signIn("authentik")（app/(auth)/login/actions.ts）。
 *
 * - Credentials: app.users の username + password_hash（scrypt）。デモ用。
 * - 初回 SSO ログイン時に profile から app.users を照合・自動作成する（signIn callback）。
 *
 * ■ 認証イベントの記録（app.login_attempts）
 * 失敗は authorize()（credentials）と callbacks.signIn（SSO）が書き、
 * **成功は events.signIn だけ**が書く（両方で書くと二重記録になる）。
 * IP / UA / 端末シグネチャは api/auth/[...nextauth]/route.ts が
 * AsyncLocalStorage で運ぶ（lib/auth-request-context.ts）。
 * 記録は best-effort — 失敗してもログインは通す。
 */

import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { currentAuthRequest } from "./lib/auth-request-context";
import { prisma } from "./lib/db";
import { EMPTY_DEVICE_CONTEXT } from "./lib/device-signals";
import type { LoginFailureReason, LoginMethod } from "./lib/login-attempt-core";
import { recordLoginAttempt, upsertUserDevice } from "./lib/login-attempts";
import { verifyPassword } from "./lib/password";
import {
  checkPortalLimit,
  clearPortalLimit,
  recordPortalLimitFailure,
} from "./lib/portal-rate-limit";

const authentikEnabled =
  !!process.env.AUTH_AUTHENTIK_ISSUER &&
  !!process.env.AUTH_AUTHENTIK_ID &&
  !!process.env.AUTH_AUTHENTIK_SECRET;

interface AuthentikProfile {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

// Authentik を **OAuth2**（OIDC ではなく）provider として定義する。
// 理由: IdP が http（https ではない）で、@auth/core は id_token 署名検証時の JWKS 取得
// にだけ allowInsecureRequests を渡さないため、http の jwks_uri が拒否されコールバック
// が OAuthCallbackError で失敗する（ログイン画面へ無言でループ）。
// type:"oauth" + nonce なし にすると processAuthorizationCodeResponse が OAuth2 経路を
// 通り id_token/JWKS 検証をスキップし、userinfo（http 許可あり）からプロフィールを取得
// する。discovery/token/userinfo は @auth/core が allowInsecureRequests を渡すため http
// でも成立。issuer は discovery に使用（末尾スラッシュ付き = discovery issuer と一致）。
// Authentik OAuth2 エンドポイント（Authentik は常に {origin}/application/o/... 配下）。
// issuer にはアプリスラッグが含まれるため origin から明示的に組み立てる。OAuth2 経路の
// userinfo は provider.userinfo.url を参照する（discovery 由来ではない）ため明示必須
// — 未指定だと "No userinfo endpoint configured" になる。token/userinfo とも http 許可。
const authentikOAuthBase = process.env.AUTH_AUTHENTIK_ISSUER
  ? `${new URL(process.env.AUTH_AUTHENTIK_ISSUER).origin}/application/o`
  : "";

const authentikProvider: OAuthConfig<AuthentikProfile> = {
  id: "authentik",
  name: "Authentik",
  type: "oauth",
  issuer: process.env.AUTH_AUTHENTIK_ISSUER,
  clientId: process.env.AUTH_AUTHENTIK_ID,
  clientSecret: process.env.AUTH_AUTHENTIK_SECRET,
  authorization: {
    url: `${authentikOAuthBase}/authorize/`,
    params: { scope: "openid profile email" },
  },
  token: `${authentikOAuthBase}/token/`,
  userinfo: `${authentikOAuthBase}/userinfo/`,
  // pkce のみ（Authentik 標準 provider と同じ）。state を含めると @auth/core が
  // 「state value could not be parsed」で失敗する（beta 既知の相性問題）。PKCE で
  // 認可コードとクライアントが束縛されるため CSRF 保護は担保される。
  checks: ["pkce"],
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? profile.sub,
      email: profile.email ?? null,
      username: profile.preferred_username ?? profile.email ?? profile.sub,
    };
  },
};

/**
 * ログインレート制限（監査 P2-9 → 2 軸へ拡張）。
 *
 * 以前はユーザー名ごとの**インメモリ** Map だった。穴が 2 つあった:
 *
 *   1. **ユーザー名単位でしか数えない。** password spraying は 1 つの
 *      パスワードを大量の名前へ順に試すので、名前ごとの budget は 1 つも
 *      消費されない。実質、無制限に撃てた。
 *   2. **プロセス再起動で消える。** ローリングデプロイのたびにカウンタが
 *      ゼロに戻り、コンテナが 2 つあれば別々に数えていた。
 *
 * どちらもポータルが先に解いている（DB 保存の app.portal_rate_limits）ので、
 * 同じ道具を使う。**ユーザー名 5 回 / IP 30 回**（どちらも 15 分）。
 *
 * ★ **IP 側はわざと緩い。** 事務所は 1 つのグローバル IP を共有しているので、
 *   きつくすると打ち間違いが数回続いただけで全員が閉め出される。IP の budget を
 *   使い切っても**アカウントは止まらない**（別回線からは通常どおり入れる）。
 *
 * ★ **DB が落ちたら制限は素通し（fail open）。** checkPortalLimit /
 *   recordPortalLimitFailure は内部で握り潰すので、表が読めないことを理由に
 *   全社がログインできなくなることはない。どのみち DB が無ければ
 *   `prisma.user.findUnique` の時点で誰も入れない。
 */
const LOGIN_USER_BUCKET = "WEB_LOGIN_USER" as const;
const LOGIN_IP_BUCKET = "WEB_LOGIN_IP" as const;

/** 失敗を数える（await しない — ログイン応答を遅らせない）。 */
function countLoginFailure(username: string, ip: string | null): void {
  void recordPortalLimitFailure(LOGIN_USER_BUCKET, username);
  if (ip) void recordPortalLimitFailure(LOGIN_IP_BUCKET, ip);
}

/** 記録用の端末文脈（リクエスト外から呼ばれたら空の文脈）。 */
function deviceContext() {
  return currentAuthRequest()?.device ?? EMPTY_DEVICE_CONTEXT;
}

/** 失敗を記録する（await しない — ログイン応答を遅らせない）。 */
function recordFailure(
  method: LoginMethod,
  reason: LoginFailureReason,
  identifier: string | null,
  userId: string | null = null,
): void {
  void recordLoginAttempt({
    outcome: "FAILURE",
    method,
    reason,
    identifier,
    userId,
    device: deviceContext(),
  });
}

/** users.is_active を見直す間隔（JWT セッション）。 */
const ACTIVE_RECHECK_MS = 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // AUTH_DEBUG=true で OAuth フロー（cookie/state/token/profile）を詳細ログ出力。
  debug: process.env.AUTH_DEBUG === "true",
  providers: [
    // name/label は NextAuth 標準のサインインページ向けの表示名——この
    // アプリは自前の /login を使い、この設定は一度も描画されない（module
    // レベルの静的設定でリクエストスコープが無く tr() も呼べない）。
    // i18n-ignore
    Credentials({
      name: "ユーザー名 / パスワード", // i18n-ignore
      credentials: {
        username: { label: "ユーザー名" }, // i18n-ignore
        password: { label: "パスワード", type: "password" }, // i18n-ignore
      },
      async authorize(credentials) {
        const username =
          typeof credentials?.username === "string"
            ? credentials.username.trim()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!username || !password) {
          recordFailure("PASSWORD", "EMPTY_INPUT", username || null);
          return null;
        }
        // 送信元 IP は route.ts が AsyncLocalStorage で運んだ端末文脈から取る
        // （resolveDeviceContext の中身は request-ip.ts の clientIpOf）。
        const ip = deviceContext().ip;
        // ユーザー名と IP のどちらかが尽きていたら、パスワードを照合せずに
        // 断る（照合そのものが scrypt で重いので、ここで切るのが要点）。
        const [userLimit, ipLimit] = await Promise.all([
          checkPortalLimit(LOGIN_USER_BUCKET, username),
          ip
            ? checkPortalLimit(LOGIN_IP_BUCKET, ip)
            : Promise.resolve({ locked: false }),
        ]);
        if (userLimit.locked || ipLimit.locked) {
          console.warn(
            `[auth] レート制限: ${userLimit.locked ? "user" : "ip"}`, // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
          );
          recordFailure("PASSWORD", "RATE_LIMITED", username);
          return null;
        }
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          // 未知のユーザー名は生値を残さない（打ち間違いのパスワードが
          // 混ざりうる）。相関キー（identifier_ref）だけが残る。
          recordFailure("PASSWORD", "UNKNOWN_USER", username);
          countLoginFailure(username, ip);
          return null;
        }
        if (!user.isActive) {
          recordFailure("PASSWORD", "USER_INACTIVE", username, user.id);
          countLoginFailure(username, ip);
          return null;
        }
        if (!user.passwordHash) {
          recordFailure("PASSWORD", "NO_PASSWORD_SET", username, user.id);
          countLoginFailure(username, ip);
          return null;
        }
        if (!(await verifyPassword(password, user.passwordHash))) {
          recordFailure("PASSWORD", "BAD_PASSWORD", username, user.id);
          countLoginFailure(username, ip);
          return null;
        }
        // 成功したので両方の budget を戻す。IP 側も戻すのは、事務所の共有
        // 回線で「誰かが打ち間違えた ぶん」が積み上がったまま残らないように
        // するため（入れた時点で、その回線を止める意味はもう無い）。
        void clearPortalLimit(LOGIN_USER_BUCKET, username);
        if (ip) void clearPortalLimit(LOGIN_IP_BUCKET, ip);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        // 成功の記録は events.signIn が一本化して書く（二重記録の防止）
        return {
          id: user.id,
          name: user.displayName,
          email: user.email ?? undefined,
          username: user.username,
        };
      },
    }),
    // Authentik（http IdP のため OAuth2 として定義。上記 authentikProvider 参照）。
    ...(authentikEnabled ? [authentikProvider] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // JWT は自己完結なので、利用停止（SY01 / user-suspension-cron）が
    // セッションに届かない。1 分に 1 回だけ users.is_active を見直し、
    // 停止されていれば token を捨てる（= 次のリクエストから未ログイン扱い）。
    // proxy 側（auth.config.ts）は Prisma を持てないので、この見直しは
    // サーバー側の auth() 呼び出し（レイアウト・Server Action・API）で効く。
    async jwt(params) {
      const base = await authConfig.callbacks.jwt(params);
      if (!base) return base;
      const uid = base.uid;
      if (typeof uid !== "string" || uid.length === 0) return base;
      const checkedAt =
        typeof base.activeCheckedAt === "number" ? base.activeCheckedAt : 0;
      const now = Date.now();
      if (params.user || now - checkedAt > ACTIVE_RECHECK_MS) {
        const row = await prisma.user.findUnique({
          where: { id: uid },
          select: { isActive: true },
        });
        if (!row?.isActive) return null;
        base.activeCheckedAt = now;
      }
      return base;
    },
    // 初回 SSO ログイン: profile から app.users を照合・自動作成し、内部 id を差し替える。
    async signIn({ user, account, profile }) {
      if (account?.provider !== "authentik") return true;
      const p = profile as {
        preferred_username?: string;
        email?: string;
        name?: string;
      } | null;
      const username =
        p?.preferred_username ?? user.email ?? p?.email ?? user.name;
      if (!username) {
        console.error(
          "[auth][sso] no username claim; profile keys=",
          Object.keys((profile as object) ?? {}),
        );
        recordFailure("SSO", "SSO_NO_USERNAME", null);
        return false;
      }
      try {
        // ★ **パスワードを持つ既存アカウントは SSO で乗っ取らせない。**
        //
        // この upsert は IdP が名乗った username で app.users を作りに行く。
        // Authentik は自社が管理しているので「勝手なアカウントが生える」心配は
        // 無く、自動作成そのものは意図した動作（初回 SSO で社員の行ができる）。
        // ただし **password_hash を持つ行 = ローカルで作った認証情報**
        // （デモ・初期管理者・SSO が届かない拠点向けの退避口）で、そこに同名の
        // IdP アカウントが入ってくると、その人になりすませてしまう。
        // IdP 側で名前を作れる人（= IdP 管理者）と、この DB のローカル
        // アカウントを作れる人は別なので、これは越境になる。
        //
        // 「SSO で作られた行か」を示す列は持っていない。パスワードの有無で
        // 代用するのは、SSO で自動作成された行は password_hash を持たない
        // （create にその列が無い）ため — 逆向きの誤判定は起きない。
        // 衝突したら**通さない**。直し方は運用の判断（ローカル行の改名か、
        // パスワードを外して SSO 行に寄せるか）で、ここで自動的に決めない。
        const existing = await prisma.user.findUnique({
          where: { username },
          select: { id: true, passwordHash: true },
        });
        if (existing?.passwordHash) {
          console.error(
            `[auth][sso] ローカルアカウントと衝突したため拒否: ${username}`, // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
          );
          recordFailure(
            "SSO",
            "SSO_LOCAL_ACCOUNT_CONFLICT",
            username,
            existing.id,
          );
          return false;
        }
        const row = await prisma.user.upsert({
          where: { username },
          create: {
            group: "EMPLOYEE",
            username,
            displayName: user.name ?? p?.name ?? username,
            email: user.email ?? p?.email ?? null,
            isActive: true,
          },
          update: { lastLoginAt: new Date() },
        });
        if (!row.isActive) {
          recordFailure("SSO", "SSO_USER_INACTIVE", username, row.id);
          return false;
        }
        user.id = row.id;
        (user as { username?: string }).username = row.username;
        return true;
      } catch (e) {
        console.error("[auth][sso] user upsert failed:", e);
        recordFailure("SSO", "SSO_UPSERT_FAILED", username);
        return false;
      }
    },
  },
  // 成功を書く唯一の場所。端末台帳（user_devices）もここで更新する。
  events: {
    async signIn({ user, account }) {
      const method: LoginMethod =
        account?.provider === "authentik" ? "SSO" : "PASSWORD";
      const device = deviceContext();
      const userId = user.id ?? null;
      const userDeviceId = userId
        ? await upsertUserDevice(userId, device)
        : null;
      await recordLoginAttempt({
        outcome: "SUCCESS",
        method,
        identifier: (user as { username?: string }).username ?? null,
        userId,
        userDeviceId,
        device,
      });
    },
  },
  // コールバックにすら届かない OAuth 失敗（state/token 取得エラー等）を拾う。
  // ALS の文脈内なので IP / UA は取れる。
  logger: {
    error(error: Error) {
      const name = error?.name ?? "";
      if (name.includes("OAuth") || name.includes("Callback")) {
        recordFailure("SSO", "SSO_CALLBACK_ERROR", null);
      }
      console.error("[auth]", error);
    },
  },
});

export const isSsoEnabled = authentikEnabled;
