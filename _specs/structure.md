# Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                                # ダッシュボード
│   │   │
│   │   ├── sales/                                  # 販売（§1 試算・価格・見積 / §2 注文受付 / §10 設計依頼）
│   │   │   ├── estimates/                          # 試算（原価計算 → 価格表登録）
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   ├── price-lists/                        # 価格表
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   ├── quotes/                             # 見積書
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   ├── order-acceptances/                  # 注文受諾書（§2）
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   └── design-requests/                    # 設計依頼書（§10）
│   │   │       ├── page.tsx
│   │   │       ├── new/page.tsx
│   │   │       └── [id]/
│   │   │           ├── page.tsx
│   │   │           └── edit/page.tsx
│   │   │
│   │   ├── purchase/                               # 購買（素材仕入・外注管理）
│   │   │   ├── material-receipts/                  # 素材入荷・受入
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── outsource-orders/                   # 外注依頼（センタレス・コーティング等）
│   │   │       ├── page.tsx
│   │   │       ├── new/page.tsx
│   │   │       └── [id]/
│   │   │           ├── page.tsx
│   │   │           └── edit/page.tsx
│   │   │
│   │   ├── production/                             # 生産（§3〜§7）
│   │   │   ├── sales-orders/                       # 受注書（§3）
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   ├── work-orders/                        # 指示書（§3〜§7）
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx                    # 詳細（工程ワークフロー表示）
│   │   │   │       ├── edit/page.tsx
│   │   │   │       └── steps/
│   │   │   │           └── [stepId]/
│   │   │   │               └── page.tsx            # 工程実行画面（現場操作）
│   │   │   ├── approvals/                          # 承認管理（§6）
│   │   │   │   ├── page.tsx                        # 承認待ち一覧
│   │   │   │   └── [id]/page.tsx
│   │   │   └── inventory/                          # 在庫管理（§4・§5）
│   │   │       ├── products/                       # 製品在庫台帳
│   │   │       │   ├── page.tsx
│   │   │       │   └── [id]/page.tsx
│   │   │       └── materials/                      # 素材在庫台帳
│   │   │           ├── page.tsx
│   │   │           └── [id]/page.tsx
│   │   │
│   │   ├── shipping/                               # 出荷（§8）
│   │   │   ├── shipping-orders/                    # 出荷書
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── edit/page.tsx
│   │   │   └── delivery-notes/                     # 納品書
│   │   │       ├── page.tsx
│   │   │       ├── new/page.tsx
│   │   │       └── [id]/
│   │   │           ├── page.tsx
│   │   │           └── edit/page.tsx
│   │   │
│   │   ├── billing/                                # 請求（§9）
│   │   │   ├── invoices/                           # 請求書
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── closings/                           # 締日処理
│   │   │       ├── page.tsx
│   │   │       └── [id]/page.tsx
│   │   │
│   │   └── master/                                 # マスタ管理
│   │       ├── customers/                          # 顧客（企業 2階層）
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       ├── edit/page.tsx
│   │       │       └── branches/                   # 支店
│   │       │           ├── new/page.tsx
│   │       │           └── [branchId]/
│   │       │               ├── page.tsx
│   │       │               └── edit/page.tsx
│   │       ├── end-users/                          # 最終需要家（大口顧客のみ）
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── products/                           # 製品
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── material-types/                     # 材種
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── materials/                          # 素材
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── suppliers/                          # 外注企業
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── process-steps/                      # 工程マスタ（工程カタログ・依存定義）
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── inspection-templates/               # 検査表テンプレート
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/page.tsx
│   │       ├── defect-types/                       # 不良種類
│   │       │   ├── page.tsx
│   │       │   └── new/page.tsx
│   │       └── approval-groups/                    # 承認グループ・代理設定
│   │           ├── page.tsx
│   │           ├── new/page.tsx
│   │           └── [id]/
│   │               ├── page.tsx
│   │               └── edit/page.tsx
│   │
│   ├── api/
│   │   ├── pdf/                                    # Gotenberg PDF生成
│   │   │   ├── quote/route.ts                      # 見積書
│   │   │   ├── sales-order/route.ts                # 受注書
│   │   │   ├── work-order/route.ts                 # 指示書
│   │   │   ├── shipping-order/route.ts             # 出荷書
│   │   │   ├── delivery-note/route.ts              # 納品書
│   │   │   └── invoice/route.ts                    # 請求書
│   │   ├── sse/                                    # SSE リアルタイム通知
│   │   │   ├── work-orders/[id]/route.ts           # 製造進捗
│   │   │   └── approvals/route.ts                  # 承認通知
│   │   └── export/
│   │       └── yayoi/route.ts                      # 弥生会計 CSV エクスポート
│   │
│   ├── (auth)/
│   │   └── login/page.tsx
│   │
│   └── layout.tsx
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx                            # 'use client' — AppShell wrapper
│   │   └── AppNav.tsx                              # 'use client' — Navbar nav links
│   ├── ui/
│   │   ├── StatusBadge.tsx                         # status enum → Badge
│   │   ├── FieldValue.tsx                          # label/value display
│   │   ├── PageHeader.tsx                          # title + breadcrumbs + actions
│   │   ├── EmptyState.tsx                          # empty list placeholder
│   │   ├── ConfirmModal.tsx                        # destructive action confirm
│   │   ├── PdfButton.tsx                           # PDF download button
│   │   ├── JsonLocalizedText.tsx                   # ja/en JSON field renderer
│   │   └── MoneyText.tsx                           # formatted currency
│   ├── sales/
│   │   ├── ProductPriceResolverInput.tsx
│   │   ├── QuoteItemsTable.tsx
│   │   └── OrderAcceptanceForm.tsx
│   ├── production/
│   │   ├── WorkOrderStepsPanel.tsx
│   │   ├── StepCard.tsx
│   │   ├── ApprovalStatusPanel.tsx
│   │   ├── InspectionRecordForm.tsx
│   │   ├── DefectRecordForm.tsx
│   │   ├── InventoryBadge.tsx
│   │   └── AuditTimeline.tsx
│   └── master/
│       ├── CustomerSelect.tsx
│       └── [entity]Table.tsx                       # per master entity
│
├── lib/
│   ├── db.ts                                       # Prisma client
│   ├── auth.ts                                     # Auth.js v5 設定
│   ├── journal.ts                                  # 仕訳エンジン（弥生連携用）
│   ├── csv-export.ts                               # 弥生会計 Next CSV 生成
│   ├── inventory.ts                                # 在庫引当・予約ロジック
│   ├── pricing.ts                                  # 試算原価計算・価格表解決・見積自動生成・値引き計算
│   ├── numbering.ts                                # 採番ロジック（EST/QOT/ORD/DRN/INV）
│   ├── workflow.ts                                 # 製造ワークフロー依存解決・実行可否判定
│   └── notifications.ts                            # 通知（SSE / メール / Nextcloud）
│
└── types/
    ├── auth.ts
    ├── sales.ts
    ├── production.ts
    ├── inventory.ts
    └── shipping.ts
```
