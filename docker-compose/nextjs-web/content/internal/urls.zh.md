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
| `https://app.ckk-tool.co.jp` | **生产** | 业务管理系统（公司外也可访问） |
| `https://ckk.kai-lab.net` | **生产** | 同上（公司内部网络用） |
| `https://ckk-dev.kai-lab.net` | 验证 | 验证用。新功能确认请用此地址 |
| `https://dev.kai-lab.net` | 验证 | 同上（旧地址） |

## 平板终端（现场共用）

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **生产** | 工序执行、指示书扫描 |
| `https://ckk-kiosk-dev.kai-lab.net` | 验证 | 验证用 |

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
| `https://dock.kai-lab.net` | Portainer（Docker 容器管理） |
| `https://monitor.kai-lab.net` | Grafana（日志・监控仪表板） |
| `https://chat.kai-lab.net` | Open WebUI（公司内部 AI 聊天） |

## 文档

| URL | 内容 |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | 操作手册（**无需登录**） |
| `https://app.ckk-tool.co.jp/internal-docs` | 公司内部文档（本页・需登录） |

## 注意事项

- **`db` / `db-dev` 可以直接看到数据库的全部内容**，包括客户、单价、成本、考勤。
  虽然是只读（写入会被数据库拒绝），但不应让仅知道 URL 的人就能打开。
  `dock` / `deploy` / `monitor` 同样是面向管理员的。
- `.kai-lab.net` 用于公司内部网络，`.ckk-tool.co.jp` 从公司外也能访问，请按用途区分使用。
- 验证环境（dev）的数据可能会在没有预告的情况下重建，**请勿当作生产环境输入重要数据**。
