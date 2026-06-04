const n=`{
  "issuer": {
    "name": "シー・ケィ・ケー株式会社",
    "address": "〒123-4567 東京都千代田区○○1-2-3",
    "tel": "TEL: 03-0000-0000　FAX: 03-0000-0001",
    "invoice_reg": "T1234567890123"
  },
  "recipient": {
    "name": "株式会社得意先名",
    "contact": "購買部　鈴木 花子 様",
    "address": "〒987-6543 大阪府大阪市△△2-3-4"
  },
  "doc": {
    "number": "ORD-202601-00005",
    "issued_date": "2026年1月20日",
    "customer_po": "PO-2026-00123",
    "sales_rep": "田中 一郎"
  },
  "ref_quote": "QOT-202601-00001",
  "status": "確定",
  "total_display": "1,182,500",
  "items": [
    {
      "name": "超硬エンドミル φ10 4枚刃",
      "code": "PRD-202601-0001",
      "order_type": "本番",
      "quantity": "50",
      "unit_price": "8,000",
      "amount": "400,000",
      "delivery_date": "2026/02/15"
    },
    {
      "name": "超硬エンドミル φ6 4枚刃",
      "code": "PRD-202601-0002",
      "order_type": "本番",
      "quantity": "100",
      "unit_price": "5,500",
      "amount": "550,000",
      "delivery_date": "2026/02/20"
    },
    {
      "name": "超硬ドリル φ8",
      "code": "PRD-202601-0003",
      "order_type": "テスト",
      "quantity": "5",
      "unit_price": "25,000",
      "amount": "125,000",
      "delivery_date": "2026/02/28"
    }
  ],
  "totals": {
    "subtotal": "1,075,000",
    "tax": "107,500",
    "grand_total": "1,182,500"
  },
  "notes": "本書をもって注文の受諾を確認いたします。<br>ご不明な点がございましたら担当営業までお問い合わせください。"
}
`;export{n as default};
