---
title: "角色与权限"
description: "系统中所有角色与权限代码的一览：谁能做什么，以及如何为用户分配角色。"
---
本系统的访问控制以 **角色**（职责集合）为单位管理。权限不会直接授予个人，而是
通过分配角色实现。一个用户可以拥有多个角色，此时其权限为 **所有角色的并集**。

> 本页依据 **dev 数据库中的实际数据** 生成。需要最新完整清单时请查看
> `_docs/rbac-role-matrix.xlsx`。查看某位用户的实际权限，请打开
> **SY01 用户管理** 的详情页面。

## 三个概念

权限描述的是「**谁**（角色）对 **哪个领域**（权限代码）能做 **什么操作**（动作）」，
必要时再加上 「**范围**」（作用域）。

- **权限代码** … 一个业务领域，未必等于一个应用（`master` 覆盖 12 个主数据应用，
  `order_acceptance` 同时覆盖 SA04 与 SA05）。
- **动作** … R=查看 / C=新建 / U=修改 / D=删除 / E=导出 /
  ◎=ADMIN（该代码的全部动作）。审批不是动作 — 谁能审批仅由
  **MS0B 审批设定** 的审批组成员资格决定。
- **作用域** … 操作可及的范围。留空表示 **ALL（全部数据）**。
  - **OWN** … 仅本人创建的数据
  - **PLANT** … 仅本人所属基地的数据（在 SY01 中设置所属基地）
  - **REGION** … 仅本人所属基地所在地区的数据

同一代码由多个角色授予时，**范围最宽的生效**（同时拥有 PLANT 与 ALL 时为 ALL）。

## 角色一览

| 角色 | rolename | 用途 |
|---|---|---|
| 管理员 | `admin` | 全部权限。唯一可以使用系统管理（SY01～）与终端管理（SY08～）的角色 |
| 管理层（审批人） | `manager` | 全业务的查看・导出，面向跨部门审批者（能否审批由 MS0B 审批组成员资格决定） |
| 销售部长 | `sales_manager` | 销售数据全量完整操作 + 全业务查看 |
| 销售 | `sales` | 销售数据 **仅限本人创建的部分** 新建・修改（OWN） |
| 销售助理 | `sales_assistant` | 销售数据仅查看，不可新建・修改・审批 |
| 采购部长 | `purchasing_manager` | 采购数据全量完整操作 + 全业务查看 |
| 采购 | `purchasing` | 采购申请・材料订购・入库・外协的日常操作 |
| 制造部长 | `production_manager` | 制造数据全量完整操作 + 全业务查看 |
| 制造・生产管理 | `production` | 工单・工序执行・库存（**仅所属基地**） |
| 品质部长 | `quality_manager` | 工单全量完整操作 + 全业务查看 |
| 品质・检查 | `quality` | 检查记录・检查审批（**仅所属基地**） |
| 出货部长 | `shipping_manager` | 出货数据全量完整操作 + 全业务查看 |
| 出货 | `shipping` | 出货单・送货单的日常操作（出货单与库存 **仅所属基地**） |
| 会计部长 | `accounting_manager` | 发票・结算全量完整操作 + 全业务查看 |
| 会计 | `accounting` | 发票・月度结算・弥生 CSV |
| 只读 | `viewer` | 全业务仅查看（面向管理层・审计） |
| 通用 | `staff` | 过渡期的临时角色，除系统与终端外均可操作。**生产环境建议改用部门角色** |

## 权限代码与对应应用

| 权限代码 | 名称 | 对应应用 |
|---|---|---|
| `price_list` | 价格表 | SA01 试算 / SA02 价格表 |
| `quote` | 报价单 | SA03 报价单 |
| `order_acceptance` | 订单受理・订单明细 | SA04 订单受理 / SA05 订单明细 |
| `design_request` | 设计委托 | SA06 设计委托单 |
| `purchase_order` | 材料订购・采购申请 | PU01 采购申请 / PU02 材料订购单 |
| `material_receipt` | 材料入库 | PU03 材料入库 |
| `outsource_order` | 外协委托 | PU04 外协委托 |
| `work_order` | 工单 | PD02 工单（终端的工序执行使用同一代码） |
| `approve` | 审批管理 | PD03 审批管理 |
| `inventory` | 库存 | PD04 库存管理 |
| `delivery_order` | 出货单 | SH01 出货单 |
| `delivery_note` | 送货单 | SH02 送货单 |
| `invoice` | 发票 | BL01 发票 |
| `billing_closing` | 结算处理 | BL02 结算处理（弥生 CSV 导出为 E） |
| `master` | 主数据管理 | MS01～MS0E 全部 12 个主数据应用 |
| `internal_docs` | 内部文档 | DC02 内部文档（本页） |
| `kiosk` | 终端管理 | SY08 二维码卡 / SY09 终端管理 / SY0A 终端设置 |
| `system` | 系统管理 | SY01～SY0C 全部系统应用 |

## 权限矩阵（销售・采购）

| 角色 | 价格表 | 报价单 | 订单受理 | 设计委托 | 采购 | 入库 | 外协 |
|---|---|---|---|---|---|---|---|
| **管理员**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **管理层（审批人）**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE |
| **销售部长**<br/>`sales_manager` | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |
| **销售**<br/>`sales` | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | — | — | — |
| **销售助理**<br/>`sales_assistant` | R | R | R | R | — | — | — |
| **采购部长**<br/>`purchasing_manager` | R | R | R | R | RCUDE | RCUDE | RCUDE |
| **采购**<br/>`purchasing` | — | — | — | — | RCUDE | RCUDE | RCUD |
| **制造部长**<br/>`production_manager` | R | R | R | R | R | R | RCUDE |
| **制造・生产管理**<br/>`production` | — | — | RU | — | R | R | RU |
| **品质部长**<br/>`quality_manager` | R | R | R | R | R | R | R |
| **品质・检查**<br/>`quality` | — | — | R | — | — | — | — |
| **出货部长**<br/>`shipping_manager` | R | R | R | R | R | R | R |
| **出货**<br/>`shipping` | — | — | R | — | — | — | — |
| **会计部长**<br/>`accounting_manager` | R | R | R | R | R | R | R |
| **会计**<br/>`accounting` | R | R | R | — | — | — | — |
| **只读**<br/>`viewer` | R | R | R | R | R | R | R |
| **通用**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE |

## 权限矩阵（生产・出货・结算・管理）

| 角色 | 工单 | 审批管理 | 库存 | 出货单 | 送货单 | 发票 | 结算 | 主数据 | 内部文档 | 终端 | 系统 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **管理员**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **管理层（审批人）**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE | RE | RE | — | — |
| **销售部长**<br/>`sales_manager` | — | R | — | — | — | — | — | R | — | — | — |
| **销售**<br/>`sales` | — | — | — | — | — | — | — | R | — | — | — |
| **销售助理**<br/>`sales_assistant` | — | — | — | — | — | — | — | R | — | — | — |
| **采购部长**<br/>`purchasing_manager` | R | R | R | R | R | R | R | R | R | — | — |
| **采购**<br/>`purchasing` | R | R | R | — | — | — | — | R | — | — | — |
| **制造部长**<br/>`production_manager` | RCUDE | R | RCUDE | R | R | R | R | R | R | — | — |
| **制造・生产管理**<br/>`production` | RCUDE<br/>PLANT | R | RCUE<br/>PLANT | R | — | — | — | R | — | — | — |
| **品质部长**<br/>`quality_manager` | RCUDE | R | R | R | R | R | R | R | R | — | — |
| **品质・检查**<br/>`quality` | RU<br/>PLANT | R | R | — | — | — | — | R | — | — | — |
| **出货部长**<br/>`shipping_manager` | R | R | RCUDE | RCUDE | RCUDE | R | R | R | R | — | — |
| **出货**<br/>`shipping` | R | — | RU<br/>PLANT | RCUDE<br/>PLANT | RCUDE | — | — | R | — | — | — |
| **会计部长**<br/>`accounting_manager` | R | R | R | R | R | RCUDE | RCUDE | R | R | — | — |
| **会计**<br/>`accounting` | — | — | — | R | R | RCUDE | RCUE | R | — | — | — |
| **只读**<br/>`viewer` | R | R | R | R | R | R | R | R | R | — | — |
| **通用**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |

## 阅读时的注意事项

### 审批由审批组管理，而不是权限动作

谁能审批**仅在审批设定（MS0B）中管理**。按下审批・驳回所需的权限只是能
**查看（R）或修改（U）**该单据 — 不再存在审批动作的授权（旧 A=审批 已全部
废止）。能打开单据、且是该层级审批组的成员（或期间内的代理人）即可审批。
只分配部长角色并不能审批，原因就在这里。

### 「能做」与「能看到」是两回事

本页说明的是 **能做什么**，而不是主页会显示哪些应用。生产环境（main）的启动器
显示由另一套机制（SY05 应用管理 / feature flags）决定，即使有权限，未发布的应用
在生产环境也不会出现。dev 环境默认全部显示。

### 系统管理与终端管理仅限管理员

`system` 与 `kiosk` 不分配给任何业务角色。用户管理・应用管理・文件管理・操作履历・
二维码卡・终端管理 **仅管理员角色** 可以使用。

## 为用户分配角色

1. 请对方先通过 SSO 登录一次（首次登录会在 `app.users` 中创建记录）。
2. 在 **SY01 用户管理** 中分配角色，并在同一画面设置所属基地
   （PLANT / REGION 作用域以此为准）。
3. 需要审批的人还要加入相应的 **审批组**（MS0B）。

## 修改权限本身

角色的内容（哪个代码授予哪些动作）以 SQL 种子文件为准：

- `shared-db/sql/rbac-seed.sql` … 18 个权限代码 + `admin` / `staff`
- `shared-db/sql/roles-seed.sql` … 15 个运营角色的权限矩阵

修改后需应用到数据库（均为幂等），并重新生成 Excel 版：

```bash
cd shared-db
./scripts/remote-db.sh sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles-seed.sql'
./scripts/remote-db.sh python3 ../tools/rbac-matrix/build_rbac_xlsx.py
```
