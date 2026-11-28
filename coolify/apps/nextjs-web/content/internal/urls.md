---
title: "システムの URL 一覧"
description: "業務アプリ・共有端末・管理ツール・DB ブラウザ・監視など、社内で使う全システムの URL と、どの環境（本番 / 検証）を指しているか。"
---

社内で使うシステムの URL 一覧です。**同じ画面でも本番と検証で URL が違います** —
検証環境（dev）のデータは本番とは完全に別物なので、触る前に URL を確かめてください。

> 2026-08-24 に本番と検証はデータベースもファイル保管も完全に分離しました。
> 検証環境で作ったデータが本番に出ることはありませんし、その逆もありません。

## 業務アプリ

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://app.ckk-tool.co.jp` | **本番** | 業務管理システム — **ふだんはこちらを使ってください** |
| `https://app-dev.ckk-tool.co.jp` | 検証 | 検証用。新機能の確認はこちら |

> **ログイン（シングルサインオン）は社内ネットワークか VPN からだけ完了します。**
> 画面そのものは社外からも開けますが、ログインの途中で開く認証画面は社内に
> しか置いていないため、社外からはそこで止まります。故障ではありません。

## 共有端末（現場のタブレット）

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **本番** | 工程実行・指示書スキャン |
| `https://ckk-kiosk-dev.kai-lab.net` | 検証 | 検証用 |
| `https://kiosk.ckk-tools.loc` | **本番** | 社内専用アドレス（社内 CA の証明書） |
| `https://kiosk-dev.ckk-tools.loc` | 検証 | 社内専用アドレス（社内 CA の証明書） |

> 共有端末は **`kai-lab.net` のまま**です（`ckk-tool.co.jp` へは移しません）。
> 現場のタブレット専用で、将来は**社内ネットワークからのみ**到達できるように
> する方針のため。端末側の設定変更・再登録は不要です。
>
> `.ckk-tools.loc` の 2 つはその社内専用アドレスです。`.loc` は公開ドメインでは
> ないため、証明書は**社内 CA（自社で作った認証局）で署名**しています。使うには
> 次の 2 つが前提です:
> 社内 DNS にそれぞれの名前 → `192.168.50.15` を追加すること、そして
> **タブレットに社内 CA の証明書を入れること**。共有端末のアプリはこの 2 つの
> アドレスに限って端末に入った社内 CA を信頼する作りで、CA は端末の初期設定
> （プロビジョニング QR）で入ります。
> 社内 CA を入れていないブラウザからは、警告を承認すれば開けます。

## 管理・分析ツール

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **本番** | admintools（メール・バックアップ/復元など） |
| `https://admin-dev.ckk-tool.co.jp` | 検証 | admintools（検証） |
| `https://bi.ckk-tool.co.jp` | **本番** | Metabase（勤怠・業務データの分析ダッシュボード） |
| `https://db.ckk-tool.co.jp` | **本番** | Prisma Studio（本番 DB のブラウザ・**閲覧のみ**） |
| `https://db-dev.ckk-tool.co.jp` | 検証 | Prisma Studio（検証 DB のブラウザ・**閲覧のみ**） |
| `https://app-intl.ckk-tool.co.jp` | — | Weblate（画面の文言の翻訳。`dev` ブランチの文言を読み、翻訳は PR として戻す） |

## 基盤・運用（情報システム担当のみ）

| URL | 中身 |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify（アプリのデプロイ管理） |
| `https://dock.ckk-tool.co.jp` | Portainer（Docker コンテナの管理） |
| `https://monitor.ckk-tool.co.jp` | Grafana（ログ・監視ダッシュボード） |
| `https://chat.ckk-tool.co.jp` | Open WebUI（社内 AI チャット） |

旧アドレス（`dock` / `monitor` / `chat` の `.kai-lab.net`）も当面つながります。

## ドキュメントと社外向けの入口

| URL | 中身 |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | 操作マニュアル（**ログイン不要**） |
| `https://app.ckk-tool.co.jp/admin-manual` | 管理マニュアル（このページ・要ログイン） |
| `https://app.ckk-tool.co.jp/portal` | 取引先ポータル（**社外の取引先向け**。社員のログインではなく、ポータルアカウントで入る） |

## システム設定の画面（`/settings`）

システムカテゴリのアプリは、どれも業務アプリの `/settings` の下にあります。
本番なら `https://app.ckk-tool.co.jp`、検証なら `https://app-dev.ckk-tool.co.jp` の
後ろに付けて開きます。`/settings` だけを開くと、ホームのシステムの欄へ移ります。

| パス | 操作コード | アプリ |
| --- | --- | --- |
| `/settings/users` | SY01 | ユーザー管理 |
| `/settings/trial-pricing-engine` | SY02 | 価格試算計算 |
| `/settings/product-items` | SY03 | 製品項目 |
| `/settings/product-types` | SY04 | 製品種別 |
| `/settings/apps` | SY05 | アプリ管理 |
| `/settings/files` | SY06 | ファイル管理 |
| `/settings/activity` | SY07 | 操作履歴 |
| `/settings/kiosk-cards` | SY08 | QRカード管理 |
| `/settings/kiosk-devices` | SY09 | 端末管理 |
| `/settings/kiosk` | SY0A | 共有端末設定 |
| `/settings/links` | SY0B | リンク管理 |
| `/settings/order-intake` | SY0C | 注文書取込 |
| `/settings/login-history` | SY0D | ログイン履歴 |
| `/settings/ai-provider` | SY0E | AI プロバイダ |
| `/settings/notification-email` | SY0F | 通知メール |
| `/settings/privileged-access` | SY0G | 特権アクセス |
| `/settings/portal` | SY0H | 取引先ポータル |
| `/settings/api-clients` | SY0I | API クライアント |
| `/settings/accounting` | SY0J | 会計連携 |

どのアプリにどの権限が要るかは「ロールと権限」のページを見てください。

## 注意

- **`db` / `db-dev` はデータベースの中身がそのまま見えます。** 取引先・単価・原価・
  勤怠まで含みます。閲覧専用（書き込みはデータベース側で拒否）ですが、URL を知って
  いる人が開ける状態にはしないでください。`dock` / `deploy` / `monitor` も同様に
  管理者向けです。
- **`.ckk-tools.loc` のアドレスをタブレットで使うには、社内 CA が端末に入って
  いる必要があります。** 入っていない端末では、アプリは証明書を信頼せず開けません。
- CKK のシステムは **`ckk-tool.co.jp` へ集約済み**です。業務アプリの旧アドレス
  （`kai-lab.net`）はもう使えません。**共有端末だけは対象外** — 現場タブレット専用で、
  将来は社内ネットワーク限定にします。
- 検証環境（dev）のデータは予告なく作り替えることがあります。**本番のつもりで
  入力しない**でください。
