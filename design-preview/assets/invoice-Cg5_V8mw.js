const n=`{
  "issuer": {
    "name": "シー・ケィ・ケー株式会社",
    "address": "〒123-4567 東京都千代田区○○1-2-3",
    "tel": "TEL: 03-0000-0000　FAX: 03-0000-0001",
    "invoice_reg": "T1234567890123"
  },
  "recipient": {
    "name": "株式会社得意先名",
    "contact": "営業部　山田 太郎 様",
    "address": "〒987-6543 大阪府大阪市△△2-3-4"
  },
  "doc": {
    "number": "INV-202601-00001",
    "issued_date": "2026年1月31日",
    "period": "2026年1月1日 〜 1月31日",
    "payment_due": "2026年2月28日"
  },
  "total_display": "1,320,000",
  "groups": [
    {
      "order_number": "ORD-202601-00005-01",
      "delivery_note": "DRN-202601-00003",
      "delivery_date": "2026/1/10",
      "group_subtotal": "400,000",
      "items": [
        {
          "name": "超硬エンドミル φ10 4枚刃（本番）",
          "code_lot": "PRD-202601-0001　Lot #1042",
          "quantity": "50",
          "unit_price": "8,000",
          "amount": "400,000"
        }
      ]
    },
    {
      "order_number": "ORD-202601-00006-01",
      "delivery_note": "DRN-202601-00005",
      "delivery_date": "2026/1/15",
      "group_subtotal": "550,000",
      "items": [
        {
          "name": "超硬エンドミル φ6 4枚刃（本番）",
          "code_lot": "PRD-202601-0002　Lot #1045",
          "quantity": "100",
          "unit_price": "5,500",
          "amount": "550,000"
        }
      ]
    },
    {
      "order_number": "ORD-202601-00008-01",
      "delivery_note": "DRN-202601-00009",
      "delivery_date": "2026/1/22",
      "group_subtotal": "250,000",
      "items": [
        {
          "name": "超硬ドリル φ8（テスト）",
          "code_lot": "PRD-202601-0003　Lot #1051",
          "quantity": "10",
          "unit_price": "25,000",
          "amount": "250,000"
        }
      ]
    }
  ],
  "totals": {
    "subtotal": "1,200,000",
    "tax": "120,000",
    "grand_total": "1,320,000"
  },
  "notes": "お振込先: ○○銀行 △△支店　普通 1234567　カ）シー・ケィ・ケー<br>振込手数料はご負担ください。"
}
`;export{n as default};
