---
title: "系统 URL 一览"
description: "业务系统、平板终端、管理工具、数据库浏览器、监控等公司内部所有系统的 URL，以及各自指向哪个环境（生产 / 验证）。"
---

公司内部使用的各系统 URL 一览。**同一个画面在生产环境和验证环境的 URL 不同** —
验证环境（dev）的数据与生产环境完全独立，操作前请先确认 URL。

> 2026-08-24 起，生产环境与验证环境已完全分离，包括数据库和文件存储。
> 在验证环境创建的数据不会出现在生产环境，反之亦然。

## 业务系统

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://ckk.kai-lab.net` | **生产** | 业务管理系统 — **目前请使用此地址** |
| `https://ckk-dev.kai-lab.net` | 验证 | 验证用。新功能确认请用此地址 |
| `https://dev.kai-lab.net` | 验证 | 同上（旧地址） |
| `https://app.ckk-tool.co.jp` | **生产** | 迁移目标地址（已准备・见下） |
| `https://app-dev.ckk-tool.co.jp` | 验证 | 迁移目标地址（已准备・见下） |

> **`ckk-tool.co.jp` 侧目前只是「准备完毕」的状态。** 页面可以打开，但登录后的
> 回调地址（SSO callback）仍指向 `kai-lab.net`，因此登录时会被跳转到
> `ckk.kai-lab.net`。待 Authentik 的允许地址更新后再正式切换。
> 在此之前**请使用 `kai-lab.net` 的地址。**

## 平板终端（现场共用）

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://kiosk.ckk-tool.co.jp` | **生产** | 工序执行、指示书扫描 |
| `https://kiosk-dev.ckk-tool.co.jp` | 验证 | 验证用 |
| `https://ckk-kiosk.kai-lab.net` | **生产** | 旧地址（暂时仍可访问） |
| `https://ckk-kiosk-dev.kai-lab.net` | 验证 | 旧地址（暂时仍可访问） |

> **请将平板终端指向新的 URL。** 终端应用内固定写有 URL，且设备信任信息
> （设备令牌）按域名区分，因此在新地址上**需要重新进行设备注册**
> （在 SY09 终端管理中重新关联）。旧地址会保留到迁移完成为止。

## 管理・分析工具

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **生产** | admintools（邮件、备份/恢复等） |
| `https://admin-dev.ckk-tool.co.jp` | 验证 | admintools（验证） |
| `https://bi.ckk-tool.co.jp` | **生产** | Metabase（考勤・业务数据分析仪表板） |
| `https://db.ckk-tool.co.jp` | **生产** | Prisma Studio（生产数据库浏览器・**仅查看**） |
| `https://db-dev.ckk-tool.co.jp` | 验证 | Prisma Studio（验证数据库浏览器・**仅查看**） |

## 基础设施・运维（仅限信息系统负责人）

| URL | 内容 |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify（应用部署管理） |
| `https://dock.ckk-tool.co.jp` | Portainer（Docker 容器管理） |
| `https://monitor.ckk-tool.co.jp` | Grafana（日志・监控仪表板） |
| `https://chat.ckk-tool.co.jp` | Open WebUI（公司内部 AI 聊天） |

`dock` / `monitor` / `chat` 的旧地址（`.kai-lab.net`）暂时仍可访问。

## 文档

| URL | 内容 |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | 操作手册（**无需登录**） |
| `https://app.ckk-tool.co.jp/internal-docs` | 公司内部文档（本页・需登录） |

## 注意事项

- **`db` / `db-dev` 可以直接看到数据库的全部内容**，包括客户、单价、成本、考勤。
  虽然是只读（写入会被数据库拒绝），但不应让仅知道 URL 的人就能打开。
  `dock` / `deploy` / `monitor` 同样是面向管理员的。
- CKK 的各系统正在**统一到 `ckk-tool.co.jp`**。平板终端与基础设施工具已迁移完成；
  业务系统本体的 `ckk-tool.co.jp` 地址也已准备好，但在 SSO 切换完成之前
  **请继续使用 `kai-lab.net`**。旧地址会保留到各自迁移完成为止。
- 验证环境（dev）的数据可能会在没有预告的情况下重建，**请勿当作生产环境输入重要数据**。
