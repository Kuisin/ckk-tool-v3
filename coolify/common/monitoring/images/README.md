# images/ — 設定を焼き込んだイメージ

## なぜ bind mount をやめたか

**Coolify はアプリのソースを `drwxr-x---`（0750, deploy ユーザー所有）で
チェックアウトする。** そのため、非 root で動くコンテナは bind mount した設定
ファイルを**読めない**（ディレクトリを辿れない）。実際 loki（uid 10001）は

```
failed parsing config: open /etc/loki/loki-config.yaml: permission denied
```

で起動できず、監視スタックの移行が失敗した。同じ理由で prometheus（uid 65534）
と grafana（uid 472）も踏む。`user: root` を足せば動くが、監視のためだけに
コンテナを root にするのは割に合わない。

## どうしたか

各サービスの設定を **イメージに COPY** する（`ckk-db` / `po-extract` と同じやり方）。
これで実行時のホスト側パーミッションに依存しなくなり、rsync でも Coolify でも
同じように動く。設定は今までどおり git 管理のまま（`../loki/` 等）で、
Dockerfile がビルド時に取り込むだけ。

**書き込みが要るもの（データ）はボリュームのまま。** 焼き込むのは読み取り専用の
設定だけで、`loki-data` / `prometheus-data` / `grafana-data` / `alloy-data` は
これまでどおり。

## 変更の手順

設定を直したら、そのサービスを再デプロイすればイメージが焼き直される。
`docker compose up -d --build`（直接デプロイ時）または Coolify の再デプロイ。
