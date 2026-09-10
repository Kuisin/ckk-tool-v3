---
title: "请款流程"
description: "结算已交货的部分并制作请款单，寄送后直到记录收款为止的流程参考，以各单据状态为中心整理。"
screenshots:
  [
    flow-billing-closing-01,
    flow-invoice-generate-01,
    flow-invoice-check-01,
    flow-invoice-send-01,
    flow-invoice-csv-01,
  ]
---

本页整理了结算已交货的部分并制作请款单，寄送后直到记录收款为止的流程。在这里确认「现在处于哪个阶段、接下来该谁做什么」，以及各**单据状态**。基本操作步骤由[标准流程](/manual/zh/process/default-flow)负责。

## 整体流程

![请款流程整体图（从结算处理到会计对接的泳道图）](../assets/diagrams/process-billing.svg)

## 各阶段的负责人与应用

| 阶段 | 做什么 | 负责人 | 使用的应用 |
|------|--------|--------|------------|
| 1. 结算 | 按客户的结算日，汇总该期间的交货部分 | 财务 | [结算处理](/manual/zh/operations/billing/billing-closing/user)（`BL02`） |
| 2. 确认内容 | 确认明细与金额 | 财务 | [请款单](/manual/zh/operations/billing/invoice/user)（`BL01`） |
| 3. 发行 | 发行 PDF | 财务 | [请款单](/manual/zh/operations/billing/invoice/user)（`BL01`） |
| 4. 寄送 | 发给客户，设为已寄送 | 财务 | [请款单](/manual/zh/operations/billing/invoice/user)（`BL01`） |
| 5. 记录收款 | 收到款项后设为已付款 | 财务 | [请款单](/manual/zh/operations/billing/invoice/user)（`BL01`） |
| 6. 交给会计 | 导出弥生会计用的 CSV | 财务 | [结算处理](/manual/zh/operations/billing/billing-closing/user)（`BL02`） |

## 各阶段发生的事

### 1. 结算（结算处理）

按各客户设定的**结算日**，汇总该期间内交货的部分。结算日与账期使用[客户主数据](/manual/zh/operations/masters/business-partner/user)中登记的内容。结算后，会根据该期间的交货部分生成请款单（操作步骤……[标准流程 §11](/manual/zh/process/default-flow#stage-11)）。

![结算处理一览画面。执行结算处理按钮以红框强调](../assets/screenshots/flow-billing-closing-01.png)

![结算处理详情画面。生成请款单按钮以红框强调](../assets/screenshots/flow-invoice-generate-01.png)

### 2～5. 请款单

确认生成的请款单的明细与金额（小计・税额・合计）后发行。发行后会保存 PDF。发给客户后设为「送付済」（已寄送），确认收款后设为「支払済」（已付款）。**这个状态就是资金管理本身**，因此要在确认实际收款后再更改。

![请款单的明细与金额。合计以红框强调](../assets/screenshots/flow-invoice-check-01.png)

![请款单操作菜单。设为已寄送以红框强调](../assets/screenshots/flow-invoice-send-01.png)

### 6. 交给会计

已结算的部分可以导出为弥生会计用的 CSV。已导出的结算处理会变为「エクスポート済」（已导出）。

![请款单操作菜单。弥生会计 CSV 以红框强调](../assets/screenshots/flow-invoice-csv-01.png)

## 单据状态

| 单据 | 状态变化 |
|------|----------|
| 结算处理 | 未处理 → 已处理 → 已导出 |
| 请款单 | 草稿 → 已发行 → 已寄送 → 已付款 |

## 容易卡住的地方

**有交货没有出现在请款单中**
确认送货单是否已为「納品済」（已交货）。另外，出货单类别为「在庫保管」（库存保管）的不属于请款对象。

**结算日不对**
确认客户主数据中的结算日・账期・付款日设置。请款按该设置执行。

**金额与预期不符**
明细的来源是送货单。请确认送货单的单价・数量与是否记载价格的设置。

## 相关页面

- 追踪一笔订单的完整流程 … [标准流程](/manual/zh/process/default-flow)
- 各应用的操作与输入栏含义 … 左侧的 **操作方法 › 请款**
- 上一个流程 … [出货流程](/manual/zh/process/shipping)
- 按客户的结算日设置 … [客户主数据](/manual/zh/operations/masters/business-partner/user)
