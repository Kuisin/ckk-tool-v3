# secrets — 機微ファイルの単一の置き場

**このディレクトリに秘密そのものは入らない。** 入っているのは雛形と手順だけで、
実体はサーバー上のディレクトリ **`/data/ckk-secrets`** にある。

## なぜ 1 本のボリュームにまとめるのか

Coolify は git からアプリを建てる。つまり **git に無いものは存在しない**。
これまで TLS 証明書・acme の更新状態・OpenVPN の設定は
`~/stacks/<stack>/` の bind mount に置いてあり、リポジトリには（正しく）
入っていなかった。そのままスタックを Coolify へ移すと、証明書を持たない
nginx や、接続情報を持たない VPN が建ってしまう。

秘密を git に入れるのは論外なので、逆に **ホスト側の 1 か所へ集約**して、
必要なコンテナがそこを読む形にした。移行しても、バックアップしても、
棚卸ししても、見る場所が 1 つで済む。

## 中身の構成

**なぜ Docker ボリュームではなくホストのディレクトリか** — Coolify は compose の
名前付きボリュームを `external: true` と書いても `<appUUID>_<name>` へ**改名する**。
つまり複数の Coolify アプリで 1 本を共有できない（実際、空のボリュームを掴んで
健全性チェックが全項目 MISSING になった）。bind mount はそのまま渡るので、
固定パスなら Coolify 管理でも直接デプロイでも同じ場所を見られる。

```
/data/ckk-secrets
    ├── nginx/
    │   ├── certs/      TLS 証明書と鍵（29 ファイル）+ 社内 CA
    │   └── acme/       acme.sh のアカウント・更新状態
    ├── vpn/
    │   └── config.ovpn OpenVPN 設定（CA + tls-auth 込み）
    └── searxng/
        └── settings.yml インスタンス固有の secret_key を含む
```

所有者は `cp -a` で保つ（searxng は uid 977 が書き換えるため）。

| 使う側 | マウント | 権限 |
|---|---|---|
| `nginx-proxy` (nginx) | `/etc/nginx/certs` | **ro** |
| `nginx-proxy` (acme.sh) | `/acme.sh` + `/certs` | **rw** |
| `ai-stack` (searxng) | `/etc/searxng` | **rw**（自分で書き換える） |
| `secrets-vault` | `/secrets` | **ro** — 健全性チェック用 |

## ファイルではない秘密は Coolify の env へ

パスワード・トークン類は**ファイルではない**ので、ここには入れない。
Coolify のアプリ env に置く（Coolify の DB = ホスト上。git には出ない）。

特に **`ldap.env` はボリュームに置けない**。compose の `env_file:` は
**ホスト側のパスを compose 解析時に読む**仕組みで、コンテナのボリュームからは
読めないため。中身の 9 キーは `vpn-ldap` アプリの env として設定する
（雛形は `ldap.env.example`）。

## 初期投入

`seed-secrets.sh` が既存の `~/stacks/...` から `ckk-secrets` へ写す（冪等）。
移行が済んだら旧 bind mount 元は消してよい（消す前に下のバックアップを取ること）。

```bash
ssh 192.168.50.15 'bash ~/stacks/coolify/seed-secrets.sh'
```

## バックアップ

`/data/ckk-secrets` は**再生成できないもの**（社内 CA の秘密鍵、VPN 設定）を含む。
失うと LAN の TLS と AD への到達が両方止まり、CA は作り直し = 全端末に
再配布が要る。`db-backup` の対象に入れること。手動で取るなら:

```bash
sudo tar czf ckk-secrets-$(date +%Y%m%d).tar.gz -C /data/ckk-secrets .
```

## 絶対にやらないこと

- **git に入れない。** `.crt` は公開情報だが `.key` と `config.ovpn` は違う。
  混在させると事故るので、ディレクトリごと入れない。
- `/data/ckk-secrets` を消さない。証明書は acme で再取得できるが、
  **社内 CA の鍵は再生成すると全キオスク端末の信頼が切れる**。
