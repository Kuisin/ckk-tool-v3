# authentik — SSO IdP（OIDC）

CKK アプリの SSO。`akadmin`（AUTHENTIK_BOOTSTRAP_PASSWORD）で
http://192.168.50.15:9000 / https://auth.kai-lab.net にログイン。

- OIDC Provider/Application「CKK」は bootstrap トークンで API 作成済み
  （redirect: https://ckk-dev.kai-lab.net と https://ckk.kai-lab.net の
  /api/auth/callback/authentik）。
- アプリ側は Coolify の AUTH_AUTHENTIK_ISSUER / _ID / _SECRET で有効化
  （揃うとログインページに SSO ボタンが出る — src/auth.ts）。
- ユーザーは Authentik 側で作成。初回 SSO ログインで app.users に自動連携
  （preferred_username / email 照合）。
