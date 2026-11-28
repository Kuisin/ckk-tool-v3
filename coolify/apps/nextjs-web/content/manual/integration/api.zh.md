---
title: "API — 读取与增量同步"
description: "认证、列表读取（keyset）、增量获取（updatedSince）、获取删除记录以及错误格式。"
---
供外部系统**读取**业务数据的 API。各接口、参数与响应格式见 **[参考](/manual/zh/integration/reference/resources)**（由代码自动生成）。本页汇总参考中看不出来的**使用约定**。

## 基础

- 基础 URL 为 `https://<主机>/api/v1`（验证环境为 `https://app-dev.ckk-tool.co.jp/api/v1`）。
- 认证使用 `Authorization: Bearer <令牌>`。令牌在 [API 客户端](/manual/zh/operations/system/external-api/user)（`SY0I`）中签发。
- 连通性检查：`GET /api/v1/me` 会返回调用方名称和**有效权限代码**，可自行排查 403。
- 机器可读的规格也可通过 `GET /api/v1/openapi.json`（需认证，OpenAPI 3.1）获取。

```bash
curl -H "Authorization: Bearer $CKK_TOKEN" \
  "https://app-dev.ckk-tool.co.jp/api/v1/order-acceptances?limit=50"
```

## 列表读取（keyset）

列表**不使用 `OFFSET`**：读取过程中若有新增行，`OFFSET` 会悄悄跳过某些行。

```json
{ "data": [ … ], "page": { "nextCursor": "…", "hasMore": true }, "syncedAt": "2026-09-10T04:11:52.881Z" }
```

- 只要 `page.hasMore` 为 `true`，就把 `page.nextCursor` 作为 `?cursor=` 传入继续读取。
- **请勿解析游标内容**（其格式可能不经通知而改变）。损坏的游标会返回 `400`，不会悄悄回到开头。
- 每页数量用 `?limit=` 指定（有上限）。

## 增量获取（`updatedSince`）

首次读取全部数据，并**保存响应中的 `syncedAt`**。之后附加 `?updatedSince=<已保存的 syncedAt>`，只读取有变化的行。

- `syncedAt` 是**本系统数据库的时钟**。**请勿用自己的时钟生成**（时钟偏差会导致行永久丢失）。
- 边界**包含在内**，同一行可能到达两次，请把处理做成**幂等**。
- 库存流水（`/inventory/transactions`）是只追加的台账，因此按创建时间过滤。

## 删除是另一个入口

物理删除对 `updatedSince` **不可见**。请同时读取 `GET /api/v1/deletions?sinceEventId=<上次的 lastEventId>`。多数单据以状态表示而非删除，所以这里主要出现草稿状态的出货单。通过 psql 等直接删除的行无法观测（执行恢复操作后请重新全量同步）。

## 值的格式

- 单据编号（`number`）形如 `ORD-2026-00042`，与画面、打印件一致。**仅凭编号无法确定唯一的单据** — 流水号按开具公司、按会计年度分别计数，另一家公司可能有相同的编号。匹配和保存请使用 `id`（行的 uuid）或 `companyCode` + `number` 的组合。
- 以旧格式（`ORD-202609-00042`）创建的单据已重新编号，原编号保存在 `legacyNumber` 中。编号规则见[单据编号规则](/manual/zh/start#doc-number)。
- 状态为数据库原值（`CONFIRMED`），不返回日文标签。
- 多语言列为 `{ "ja": "…", "en": "…" }`。金额为数值，币种为单独字段。时间为 UTC 的 RFC 3339。
- **可能出现新值**（例如订单类别 `REGRIND`）。`switch` 一定要写默认分支。

## 错误

错误采用 RFC 9457（`application/problem+json`）。请按 `code` 分支处理（文案可能变化）。

- 认证失败时**无论原因都返回相同的 401**（防止从外部探测令牌是否存在）。原因只记录在管理端日志中。
- 403 表示“令牌正确但权限不足”，响应中会写明所需权限（如 `quote:READ`）。
- 429 是对连续认证失败的来源地址的限制。

## 行范围

API 按与画面**相同的规则**过滤行。例如权限限定为创建者时，他人创建的报价单不会返回。若应当可见的行没有出现，请检查分配给 API 客户端的角色范围。
