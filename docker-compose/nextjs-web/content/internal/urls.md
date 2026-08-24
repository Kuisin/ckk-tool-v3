---
title: "システムの URL 一覧"
description: "業務アプリ・キオスク・管理ツール・DB ブラウザ・監視など、社内で使う全システムの URL と、どの環境（本番 / 検証）を指しているか。"
---

社内で使うシステムの URL 一覧です。**同じ画面でも本番と検証で URL が違います** —
検証環境（dev）のデータは本番とは完全に別物なので、触る前に URL を確かめてください。

> 2026-08-24 に本番と検証はデータベースもファイル保管も完全に分離しました。
> 検証環境で作ったデータが本番に出ることはありませんし、その逆もありません。

## 業務アプリ

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://app.ckk-tool.co.jp` | **本番** | 業務管理システム（社外からも利用可） |
| `https://ckk.kai-lab.net` | **本番** | 同上（社内ネットワーク用） |
| `https://ckk-dev.kai-lab.net` | 検証 | 検証用。新機能の確認はこちら |
| `https://dev.kai-lab.net` | 検証 | 上と同じ（旧アドレス） |

## キオスク（現場の共有タブレット）

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **本番** | 工程実行・指示書スキャン |
| `https://ckk-kiosk-dev.kai-lab.net` | 検証 | 検証用 |

## 管理・分析ツール

| URL | 環境 | 中身 |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **本番** | admintools（メール・バックアップ/復元など） |
| `https://admin-dev.ckk-tool.co.jp` | 検証 | admintools（検証） |
| `https://bi.ckk-tool.co.jp` | **本番** | Metabase（勤怠・業務データの分析ダッシュボード） |
| `https://db.ckk-tool.co.jp` | **本番** | Prisma Studio（本番 DB のブラウザ・**閲覧のみ**） |
| `https://db-dev.ckk-tool.co.jp` | 検証 | Prisma Studio（検証 DB のブラウザ・**閲覧のみ**） |

## 基盤・運用（情報システム担当のみ）

| URL | 中身 |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify（アプリのデプロイ管理） |
| `https://dock.kai-lab.net` | Portainer（Docker コンテナの管理） |
| `https://monitor.kai-lab.net` | Grafana（ログ・監視ダッシュボード） |
| `https://chat.kai-lab.net` | Open WebUI（社内 AI チャット） |

## 公開ドキュメント

| URL | 中身 |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | 操作マニュアル（**ログイン不要**） |
| `https://app.ckk-tool.co.jp/internal-docs` | 社内ドキュメント（このページ・要ログイン） |

## 注意

- **`db` / `db-dev` はデータベースの中身がそのまま見えます。** 取引先・単価・原価・
  勤怠まで含みます。閲覧専用（書き込みはデータベース側で拒否）ですが、URL を知って
  いる人が開ける状態にはしないでください。`dock` / `deploy` / `monitor` も同様に
  管理者向けです。
- `.kai-lab.net` は社内ネットワーク用、`.ckk-tool.co.jp` は社外からも到達できる
  アドレスです。用途で使い分けてください。
- 検証環境（dev）のデータは予告なく作り替えることがあります。**本番のつもりで
  入力しない**でください。
