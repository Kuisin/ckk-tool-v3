---
title: "系统 URL 一览"
description: "业务系统、共用终端、管理工具、数据库浏览器、监控等公司内部所有系统的 URL，以及各自指向哪个环境（生产 / 验证）。"
---

公司内部使用的各系统 URL 一览。**同一个画面在生产环境和验证环境的 URL 不同** —
验证环境（dev）的数据与生产环境完全独立，操作前请先确认 URL。

> 2026-08-24 起，生产环境与验证环境已完全分离，包括数据库和文件存储。
> 在验证环境创建的数据不会出现在生产环境，反之亦然。

## 业务系统

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://app.ckk-tool.co.jp` | **生产** | 业务管理系统 — **日常请使用此地址** |
| `https://app-dev.ckk-tool.co.jp` | 验证 | 验证用。新功能确认请用此地址 |

> **登录（单点登录）只能在公司内部网络或 VPN 下完成。** 页面本身在公司外部也能
> 打开，但登录过程中出现的认证画面只部署在公司内部，因此在外部会停在那一步。
> 这不是故障。

## 共用终端（现场平板）

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://ckk-kiosk.kai-lab.net` | **生产** | 工序执行、工单扫描 |
| `https://ckk-kiosk-dev.kai-lab.net` | 验证 | 验证用 |
| `https://kiosk.ckk-tools.loc` | **生产** | 公司内部专用地址（内部 CA 证书） |
| `https://kiosk-dev.ckk-tools.loc` | 验证 | 公司内部专用地址（内部 CA 证书） |

> 共用终端**保持使用 `kai-lab.net`**，不迁移到 `ckk-tool.co.jp`。
> 因为它只在车间平板上使用，今后计划改为**仅限公司内部网络**访问。
> 终端侧无需任何变更。
>
> 两个 `.ckk-tools.loc` 就是该内部专用地址。`.loc` 不是公开域名，因此证书由
> **公司内部 CA（自建的证书颁发机构）签名**。使用时需要满足两个前提：在公司内部
> DNS 中为各个名称添加 → `192.168.50.15`；以及**在平板上安装内部 CA 证书**。
> 共用终端应用仅对这两个地址信任终端上安装的内部 CA，CA 会在终端初始设置
> （配置二维码）时安装。
> 未安装内部 CA 的浏览器，确认安全警告后即可打开。

## 管理・分析工具

| URL | 环境 | 内容 |
| --- | --- | --- |
| `https://admin.ckk-tool.co.jp` | **生产** | admintools（邮件、备份/恢复等） |
| `https://admin-dev.ckk-tool.co.jp` | 验证 | admintools（验证） |
| `https://bi.ckk-tool.co.jp` | **生产** | Metabase（考勤・业务数据分析仪表板） |
| `https://db.ckk-tool.co.jp` | **生产** | Prisma Studio（生产数据库浏览器・**仅查看**） |
| `https://db-dev.ckk-tool.co.jp` | 验证 | Prisma Studio（验证数据库浏览器・**仅查看**） |
| `https://app-intl.ckk-tool.co.jp` | — | Weblate（画面文字的翻译。读取 `dev` 分支的文字，翻译以 PR 的形式提交回来） |

## 基础设施・运维（仅限信息系统负责人）

| URL | 内容 |
| --- | --- |
| `https://deploy.ckk-tool.co.jp` | Coolify（应用部署管理） |
| `https://dock.ckk-tool.co.jp` | Portainer（Docker 容器管理） |
| `https://monitor.ckk-tool.co.jp` | Grafana（日志・监控仪表板） |
| `https://chat.ckk-tool.co.jp` | Open WebUI（公司内部 AI 聊天） |

`dock` / `monitor` / `chat` 的旧地址（`.kai-lab.net`）暂时仍可访问。

## 文档与面向外部的入口

| URL | 内容 |
| --- | --- |
| `https://app.ckk-tool.co.jp/manual` | 操作手册（**无需登录**） |
| `https://app.ckk-tool.co.jp/admin-manual` | 管理手册（本页・需登录） |
| `https://app.ckk-tool.co.jp/portal` | 客户门户（**面向外部业务伙伴**。不是员工登录，而是用门户账号登录） |

## 系统设置画面（`/settings`）

系统类别的应用都位于业务系统的 `/settings` 下。生产环境接在
`https://app.ckk-tool.co.jp` 后面，验证环境接在 `https://app-dev.ckk-tool.co.jp`
后面打开。只打开 `/settings` 时，会跳转到首页的系统栏。

| 路径 | 操作代码 | 应用 |
| --- | --- | --- |
| `/settings/users` | SY01 | 用户管理 |
| `/settings/trial-pricing-engine` | SY02 | 价格试算计算 |
| `/settings/product-items` | SY03 | 产品项目 |
| `/settings/product-types` | SY04 | 产品类别 |
| `/settings/apps` | SY05 | 应用管理 |
| `/settings/files` | SY06 | 文件管理 |
| `/settings/activity` | SY07 | 操作历史 |
| `/settings/kiosk-cards` | SY08 | 二维码卡管理 |
| `/settings/kiosk-devices` | SY09 | 终端管理 |
| `/settings/kiosk` | SY0A | 共用终端设置 |
| `/settings/links` | SY0B | 链接管理 |
| `/settings/order-intake` | SY0C | 订单导入 |
| `/settings/login-history` | SY0D | 登录历史 |
| `/settings/ai-provider` | SY0E | AI 服务商 |
| `/settings/notification-email` | SY0F | 通知邮件 |
| `/settings/privileged-access` | SY0G | 特权访问 |
| `/settings/portal` | SY0H | 客户门户 |
| `/settings/api-clients` | SY0I | API 客户端 |
| `/settings/accounting` | SY0J | 会计对接 |

各应用需要哪些权限，请参阅「角色与权限」页面。

## 注意事项

- **`db` / `db-dev` 可以直接看到数据库的全部内容**，包括客户、单价、成本、考勤。
  虽然是只读（写入会被数据库拒绝），但不应让仅知道 URL 的人就能打开。
  `dock` / `deploy` / `monitor` 同样是面向管理员的。
- **在平板上使用 `.ckk-tools.loc` 地址，需要终端已安装内部 CA。** 未安装时，
  应用不信任该证书，无法打开。
- CKK 的各系统**已统一到 `ckk-tool.co.jp`**。业务系统的旧地址（`kai-lab.net`）
  已无法使用。**只有共用终端例外** — 它是现场平板专用，今后将限定为仅公司内部网络访问。
- 验证环境（dev）的数据可能会在没有预告的情况下重建，**请勿当作生产环境输入重要数据**。
