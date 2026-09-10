---
title: "生产流程"
description: "从接单确定起，经过库存确认・审批・工序执行，直到成为可出货产品为止的流程参考，以分支与各单据状态为中心整理。"
screenshots:
  [
    flow-inventory-products-01,
    flow-inventory-materials-01,
    flow-work-order-new-01,
    flow-approval-01,
    flow-steps-01,
    flow-step-complete-01,
    flow-inventory-in-01,
  ]
---

本页整理了从接单确定起，确认库存、获得审批、执行工序，直到成为可出货产品为止的流程。在这里确认「现在处于哪个阶段、接下来该谁做什么」，以及库存核对・退回・不良的**分支**、各**单据状态**。基本操作步骤由[标准流程](/manual/zh/process/default-flow)负责。

## 整体流程

![生产流程整体图（含库存核对分支・审批退回的泳道图）](../assets/diagrams/process-production.svg)

## 各阶段的负责人与应用

| 阶段 | 做什么 | 负责人 | 使用的应用 |
|------|--------|--------|------------|
| 1. 确认产品库存 | 区分已有库存的部分与需要新制作的部分 | 生产管理 | [库存管理](/manual/zh/operations/production/product-inventory/user)（`PD04`） |
| 2. 确认材料 | 查看制作所需的材料是否充足 | 生产管理 | [库存管理](/manual/zh/operations/production/material-inventory/user)（`PD04`） |
| 3. 制作工单 | 分为库存分・制造分（排列工序的是制造分） | 内部销售助理 | [工单](/manual/zh/operations/production/work-order/user)（`PD02`） |
| 4. 获得审批 | 通过审批设置中确定的全部审批级，使其成为可以开始制造的状态 | 审批人 | [审批管理](/manual/zh/operations/production/approval/user)（`PD03`） |
| 5. 执行工序 | 现场记录开始・完成与支数 | 制造 | [工单](/manual/zh/operations/production/work-order/user) / 现场平板电脑 |
| 6. 完成 | 全部工序结束后成为产品库存 | 制造・生产管理 | [库存管理](/manual/zh/operations/production/product-inventory/user) |

## 各阶段发生的事

### 1～2. 确认库存

先查看产品库存，分为**可从库存出的部分**与**需要新制作的部分**。对于需要制作的部分，确认材料是否充足，不足时进入[采购流程](/manual/zh/process/purchasing)。从外部采购的半成品如何处理，请参见[采购流程](/manual/zh/process/purchasing)。

![库存管理的产品标签页。可用列以红框强调](../assets/screenshots/flow-inventory-products-01.png)

![库存管理的材料标签页。可用列以红框强调](../assets/screenshots/flow-inventory-materials-01.png)

### 3. 制作工单

库存分与制造分各自制作工单。按顺序排列工序的是制造分，必须从**恰好 1 个**「出し・受渡し」（出库・交接）工序开始（不能选多个）。工序的排列可以按产品 × 订货客户（业务伙伴）登记为**工序路线**，制作工单时会按「订货客户一致的路线 → 不限定订货客户的路线 → 第一条路线」的顺序自动选择。**库存分是「製品出し」（产品出库）＋可选的「出荷前検査」（发货前检查）的固定构成**，创建后库存会被占用。出货本身不是工序，由[出货单](/manual/zh/operations/shipping/delivery-order/user)管理。同一订货客户・产品若有上一次的工单，可以复制（内容有变化时会显示警告）。按工序决定在厂内进行还是交给外协，设为外协后会出现在[外协委托单](/manual/zh/operations/purchasing/outsource-order/user)的一览中（操作步骤……[标准流程 §6](/manual/zh/process/default-flow#stage-6)）。

![由订单明细制作的工单新建画面。保存按钮以红框强调](../assets/screenshots/flow-work-order-new-01.png)

### 4. 审批

工单在批准之前无法开始制造。要经过几级审批由[审批设置](/manual/zh/operations/masters/approval-setting/user)（`MS0B`）决定，按确定的级数依次通过。设置了条件规则时，级数的构成可能因工单内容（类别・计划数量等）而变化。**若被退回，需要修改内容后重新申请审批**（操作步骤……[标准流程 §7](/manual/zh/process/default-flow#stage-7)）。

![审批中的工单。批准按钮以红框强调](../assets/screenshots/flow-approval-01.png)

### 5. 执行工序

现场按工序记录开始・完成。输入接收的支数，并逐行输入不良 —— 每行填入区分（半成品・报废・工序分支）・不良类别・详情・支数，良品数与各区分的合计会根据该列表自动确定。**可以暂停与继续**，作业时间按每个区段累计。同时作业多道工序的时间，会按同时作业数分摊（2 道同时则各算一半）。现场平板电脑也能进行同样的操作（操作步骤……[标准流程 §8](/manual/zh/process/default-flow#stage-8)）。

**不良分支** —— 出现不良时，可以把该部分流向另一个工序序列（分支）进行返修。

**分支的变更同样需要审批** —— 在已批准・进行中的工单上添加・变更・删除分支时，若审批设置中有「工程フロー変更」（工序流程变更）的审批级，就会成为审批对象。设为事前审批时，变更会保留到批准为止；设为事后审批时，会当场应用，之后再接受审批。事后审批被退回时，工序不会自动恢复，在确认之前工单上会一直显示红色提醒。

![工单工序一览。正在作业的工序以红框强调](../assets/screenshots/flow-steps-01.png)

![数量・不良输入画面。完成按钮以红框强调](../assets/screenshots/flow-step-complete-01.png)

### 6. 完成

全部工序结束后，该工单的产品会进入库存，可以进入[出货流程](/manual/zh/process/shipping)。

![产品库存的交易历史。入库记录以红框强调](../assets/screenshots/flow-inventory-in-01.png)

## 单据状态

| 单据 | 状态变化 |
|------|----------|
| 订单明细 | 草稿 → 确定 → 生产中 → 部分出货 → 已出货（只能通过按订单确认书发起的申请 → 审批取消） |
| 工单 | 草稿 → 审批中 → 已批准 → 进行中 → 已完成（可能取消） |
| 工单的审批 | 审批中 → 已批准（可能退回）。现在处于第几级会显示在审批管理与工单画面中 |
| 工序 | 未开始 → 进行中 → 已完成（可能取消。暂停中仍为进行中） |

## 容易卡住的地方

**无法开始工序**
可能前一道工序尚未完成，或工单尚未批准。请确认工单的状态与前道工序是否完成。此外，必须输入批次/单据代码的工序未输入时、前置工单（工单详情的「关联工单」）未完成时、其他用户正在会话中时，也无法开始。

**工单未获批准**
每一级的审批人（组）不同。请在审批管理中确认现在停在第几级。

**想查看已完成工单的工序**
完成・取消后工序仍可打开。按钮会变为「詳細」（详情），可以回看实绩与检查记录。

**无法完成工序（卡在不良输入）**
良品数由接收数与不良合计自动计算，因此不会出现支数不一致。无法完成的原因是不良行中缺少不良类别或详情，或不良合计超过了接收数。请检查不良行，为每一行补齐区分・不良类别・详情・支数。

## 相关页面

- 追踪一笔订单的完整流程 … [标准流程](/manual/zh/process/default-flow)
- 各应用的操作与输入栏含义 … 左侧的 **操作方法 › 生产**
- 上一个流程 … [销售流程](/manual/zh/process/sales)
- 下一个流程 … [出货流程](/manual/zh/process/shipping)
