# nextcloud-app — CKK Link Preview（権限連動リンクプレビュー）

Nextcloud（Talk / Text）に貼られた CKK 業務管理システムの URL
（`https://ckk.kai-lab.net/...` / `https://ckk-dev.kai-lab.net/...`）を、
**閲覧ユーザーの権限に応じた内容**でプレビュー表示するカスタムアプリ。

## 仕組み

```
Nextcloud (ckk_link_preview / IReferenceProvider)
   │  GET /api/preview/resolve?url=<貼られたURL>&user=<NCログインID>
   │  Header: X-Preview-Token: <共有シークレット>
   ▼
nextjs-web /api/preview/resolve
   1. URL → 対象解決（src/lib/link-preview.ts）
      文書: EST-/PRC-/QOT- 番号 URL、マスタ: 材種/素材/製品の int id URL
   2. users.username = <NCログインID>（Samba AD で同一 ID）を照会し、
      user_permissions view で対象 permission_code の READ を判定
   3. 権限あり → 顧客名・金額・状態入りのリッチ文
      権限なし/ユーザー不明 → 汎用文（文書種別 + 番号のみ、業務データなし）
```

- Nextcloud 側のプレビューキャッシュはユーザーごと（`getCachePrefix`）。
- 未認証の標準 OG スクレイパ向けには、各詳細ページの `generateMetadata`
  が汎用タイトル（種別+番号のみ）を返す。

## CKK（nextjs-web）側の設定

Coolify の環境変数に共有シークレットを追加（値はコミットしない）:

```
PREVIEW_SHARED_SECRET=<ランダムな長い値>   # 例: openssl rand -hex 32
```

未設定の間は `/api/preview/resolve` が 503 を返し、機能は無効のまま。

## Nextcloud 側のインストール（手動配置）

Nextcloud はこのリポジトリの管理外（外部インスタンス）のため手動配置:

```bash
# 1. アプリを Nextcloud の apps ディレクトリへコピー
rsync -a docker-compose/nextcloud-app/ckk_link_preview/ \
  <nextcloud>/apps/ckk_link_preview/

# 2. 有効化
occ app:enable ckk_link_preview

# 3. 照会先とシークレットを設定（CKK 側と同じ値）
occ config:app:set ckk_link_preview api_base --value "https://ckk.kai-lab.net"
occ config:app:set ckk_link_preview shared_secret --value "<PREVIEW_SHARED_SECRET と同じ値>"
```

dev 検証時は `api_base` に `https://ckk-dev.kai-lab.net` を設定する。
Nextcloud サーバーから CKK アプリの origin へ HTTPS 到達できること
（LAN 内なら nginx-proxy 経由で同名ホストに解決される）。

## 動作確認

```bash
# 汎用（権限なし/ユーザー不明）
curl -sf -H "X-Preview-Token: $PREVIEW_SHARED_SECRET" \
  "https://ckk-dev.kai-lab.net/api/preview/resolve?url=/sales/price-lists/PRC-202607-00001&user=nobody"
# → {"matched":true,"allowed":false,"title":"価格表 PRC-202607-00001"}

# リッチ（READ 権限のあるユーザー）
curl -sf -H "X-Preview-Token: $PREVIEW_SHARED_SECRET" \
  "https://ckk-dev.kai-lab.net/api/preview/resolve?url=/sales/price-lists/PRC-202607-00001&user=<AD username>"
# → {"matched":true,"allowed":true,"title":"...","description":"顧客 / 製品 / 基準単価 ..."}

# トークン無し → 401、PREVIEW_SHARED_SECRET 未設定 → 503
```

権限は `user_permissions` view（roles → role_permission_relation 集約）で
判定する。対象 permission_code: 販売系文書 = `sales`、マスタ = `master`
（`src/lib/link-preview.ts` の `PERMISSION_BY_SECTION`）。
