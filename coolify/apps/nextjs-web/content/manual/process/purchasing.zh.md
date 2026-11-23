---
title: "采购流程"
description: "从发现材料不足起，经过下单、收货，直到可作为库存使用为止的流程参考，以分支与各单据状态为中心整理。"
screenshots:
  [
    flow-purchase-request-01,
    flow-purchase-request-approve-01,
    flow-purchase-order-create-01,
    flow-purchase-order-approve-01,
    flow-material-receipt-01,
    flow-outsource-order-01,
  ]
---

本页整理了从发现材料不足起，经过下单、收货，直到可作为库存使用为止的流程。在这里确认「现在处于哪个阶段、接下来该谁做什么」，以及审批・分批到货的**分支**、各**单据状态**。

## 整体流程

![采购 — 从申请材料到到货](../assets/diagrams/flow-purchasing.zh.svg)

各步骤的分支与使用的应用一览，请参见[业务流程](/manual/zh/business-flow#purchasing)。

紧急时或金额较小时，也可以不经采购申请，**直接从采购单**开始。从外部采购的半成品不制作工单，只作为材料接收即可。

## 各阶段的负责人与应用

| 阶段 | 做什么 | 负责人 | 使用的应用 |
|------|--------|--------|------------|
| 1. 列出所需材料 | 写明想要的材料・数量・希望交期，以及需要的理由 | 生产管理・现场 | [采购申请](/manual/zh/operations/purchasing/purchase-request/user)（`PU01`） |
| 2. 审批申请 | 判断是否真的需要，批准或退回 | 审批人 | [采购申请](/manual/zh/operations/purchasing/purchase-request/user)（`PU01`） |
| 3. 制作采购单 | 确定供应商・单价・预计到货日 | 采购负责人 | [材料采购单](/manual/zh/operations/purchasing/purchase-order/user)（`PU02`） |
| 4～5. 审批并下单 | 查看金额与条件后批准，向供应商下单 | 审批人 → 采购负责人 | [材料采购单](/manual/zh/operations/purchasing/purchase-order/user)（`PU02`） |
| 6. 记录收货 | 订购的材料在采购单上点击「入荷完了」（到货完成）或「分割入荷」（分批到货）。只有不经采购单的材料才在材料到货中记录 | 收货负责人 | [材料采购单](/manual/zh/operations/purchasing/purchase-order/user)（`PU02`）／直接采购：[材料到货](/manual/zh/operations/purchasing/material-receipt/user)（`PU03`） |
| （并行）外协 | 把部分加工交给外部公司 | 生产管理 | [外协委托单](/manual/zh/operations/purchasing/outsource-order/user)（`PU04`） |

## 各阶段发生的事

### 1. 起草申请（采购申请）

填入想要的材料・数量・到货据点・希望交期，写明**为什么需要**，然后申请审批。审批人会根据这个理由判断，因此写清楚用于哪个产品的哪道工序，会推进得更快。

![采购申请新建画面。保存按钮以红框强调](../assets/screenshots/flow-purchase-request-01.png)

### 2. 审批申请

审批人确认内容后批准。**若被退回，需要修改内容后重新申请。**

![审批中的采购申请。批准操作以红框强调](../assets/screenshots/flow-purchase-request-approve-01.png)

### 3. 制作采购单（材料采购单）

从已批准的申请制作采购单（也可以不经申请直接制作）。在这里确定**供应商・单价・预计到货日**。单价之后还会用作价格试算中材料费的参考，因此请填入实际的交易价格。

![已批准的采购申请。转换为采购单按钮以红框强调](../assets/screenshots/flow-purchase-order-create-01.png)

### 4～5. 审批采购单并下单

确认金额与条件后申请审批。批准后向供应商下单，状态变为「発注済」（已下单）。已下单的部分会作为预计到货处理。

![草稿状态的材料采购单。申请审批按钮以红框强调](../assets/screenshots/flow-purchase-order-approve-01.png)

### 6. 记录收货

记录到货的材料。**以记录的日期，收货据点的库存会增加。** 订购的材料 **在该材料采购单的画面上** 记录，记录后会自动生成与采购单关联的材料到货记录。

**分批到货分支** —— 全部送到时用「**入荷完了**」（到货完成）一次性接收剩余部分。只送到一部分时用「**分割入荷**」（分批到货）只接收送到的部分（不能超过订货数）。所有明细达到订货数后，采购单自动变为「入荷完了」（已入库）。确定剩余部分不会送来时，用「**未入荷のまま完了**」（未到货直接完成）填写理由，不做到货直接结束。

> ⚠️ 不要在[材料到货](/manual/zh/operations/purchasing/material-receipt/user)（`PU03`）的「新規作成」（新建）或「納品書から登録」（从送货单登记）中记录订购材料的到货。那里的到货不会关联到采购单，采购单的剩余数量不会减少，之后再点击「入荷完了」（到货完成）时同样的材料会再次入库。材料到货画面仅用于不经采购单购买的材料（直接采购）。

下面是用于记录直接采购到货的材料到货画面。

![材料到货记录画面。保存按钮以红框强调](../assets/screenshots/flow-material-receipt-01.png)

### 关于外协委托单

外协不是从采购申请或采购单产生，而是从**工单的工序**产生。把工序的实施场所选为「外协」并指定外协厂商后，就会出现在[外协委托单](/manual/zh/operations/purchasing/outsource-order/user)的一览中。外协委托单画面是用于查看状况的一览，无法从那里新建外协。

![外协委托单一览画面。外协厂商的行以红框强调](../assets/screenshots/flow-outsource-order-01.png)

## 单据状态

| 单据 | 状态变化 |
|------|----------|
| 采购申请 | 草稿 → 审批中 → 已批准 → 已下单（可能退回・取消） |
| 材料采购单 | 草稿 → 审批中 → 已批准 → 已下单 → 已入库（可能取消） |

## 容易卡住的地方

**申请未获批准**
确认申请理由是否只写了「因为需要」。写明用于哪个产品的哪道工序、何时之前需要，审批人才能判断。

**无法提交审批**
如果采购申请或材料采购单的审批流程中一级也没有，就无法提交审批。请管理员在[审批设置](/manual/zh/operations/masters/approval-setting/user)（`MS0B`）中创建审批级。

**库存没有增加**
可能还没有记录到货。订购的材料请在采购单上用「入荷完了」（到货完成）或「分割入荷」（分批到货）记录；不经采购单的材料请在材料到货中记录到货数量与收货据点。

**库存进入了别的据点**
到货据点选错了。请选择货物实际到达的据点。

**采购单不会变为「入荷完了」（已入库）**
下单数量中还有尚未记录的部分。分批到货时，每次到货都要在采购单上用「分割入荷」（分批到货）记录一次。在材料到货画面记录的部分不会计入采购单。剩余部分不会送来时，请用「未入荷のまま完了」（未到货直接完成）结束。

## 相关页面

- 追踪一笔订单的完整流程 … [标准流程](/manual/zh/process/default-flow)
- 各应用的操作与输入栏含义 … 左侧的 **操作方法 › 采购**
- 返回的流程 … [生产流程](/manual/zh/process/production)（材料不足由此而来）
- 材料本身的登记 … [材料主数据](/manual/zh/operations/masters/material/user)
- 库存的确认 … [库存管理](/manual/zh/operations/inventory/inventory-management/user)
