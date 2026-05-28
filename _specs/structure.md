# Structure
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── sales/          # 販売
│   │   ├── purchase/       # 購買
│   │   ├── production/     # 生産
│   │   ├── shipping/       # 出荷
│   │   ├── billing/        # 請求
│   │   └── master/         # マスタ
│   │       └── partners/   # 外部関係者マスタ（BP）
│   │           └── [id]/   # BP 詳細・ロール・担当者管理
│   └── api/
│       └── pdf/
├── components/
├── lib/
│   ├── db.ts               # Prisma
│   ├── journal.ts          # 仕訳エンジン
│   └── csv-export.ts       # 弥生連携
└── types/
```
