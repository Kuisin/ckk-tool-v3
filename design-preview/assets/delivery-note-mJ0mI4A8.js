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
    "number": "DRN-202602-00007",
    "issued_date": "2026年2月15日",
    "delivery_date": "2026年2月15日",
    "shipping_ref": "ORD-202601-00005-01"
  },
  "delivery_type_label": "ユーザー直送",
  "delivery_type_note": "製品は最終需要家へ直送済み。本納品書は受注先宛てに別送します",
  "end_user": {
    "name": "株式会社○○製作所 浜松工場",
    "address": "〒430-0000 静岡県浜松市□□1-2-3",
    "contact": "生産技術部　山田 太郎 様"
  },
  "include_price": true,
  "hide_price": false,
  "items": [
    {
      "name": "超硬エンドミル φ10 4枚刃",
      "code_lot": "PRD-202601-0001　Lot #1042",
      "quantity": "50",
      "unit": "本",
      "unit_price": "8,000",
      "amount": "400,000"
    }
  ],
  "totals": {
    "subtotal": "400,000",
    "tax": "40,000",
    "grand_total": "440,000"
  },
  "notes": "製品は最終需要家（株式会社○○製作所 浜松工場）へ直送済みです。<br>お受け取りの際はご確認のうえ、受領欄にご署名をお願いいたします。"
}
`;export{n as default};
