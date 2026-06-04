const t=`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>注文受諾書</title>
  <link rel="stylesheet" href="base.css" />
</head>
<body>

  <div class="header">
    <div class="doc-title">注文受諾書</div>
    <div class="issuer">
      <strong>{{issuer.name}}</strong><br>
      {{issuer.address}}<br>
      {{issuer.tel}}<br>
      登録番号: {{issuer.invoice_reg}}
    </div>
  </div>

  <div class="meta-row">
    <div class="recipient-block">
      <div class="recipient-name">{{recipient.name}}　<span class="onchu">御中</span></div>
      <div class="recipient-meta">
        担当: {{recipient.contact}}<br>
        {{recipient.address}}
      </div>
    </div>
    <div class="doc-info">
      <table>
        <tr><td>注文受諾書番号</td><td>{{doc.number}}</td></tr>
        <tr><td>発行日</td><td>{{doc.issued_date}}</td></tr>
        <tr><td>顧客注文書番号</td><td>{{doc.customer_po}}</td></tr>
        <tr><td>担当営業</td><td>{{doc.sales_rep}}</td></tr>
      </table>
    </div>
  </div>

  <div class="strip row">
    <div>
      <div class="cell-label">参照見積書</div>
      <div class="cell-value">{{ref_quote}}</div>
    </div>
    <div>
      <div class="cell-label">ステータス</div>
      <div class="cell-value">{{status}}</div>
    </div>
  </div>

  <div class="strip">
    <div class="label">受注金額合計（税込）</div>
    <div class="amount">¥ {{total_display}}</div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 35%">製品</th>
        <th>注文種別</th>
        <th class="right">数量</th>
        <th class="right">単価 (円)</th>
        <th class="right">金額 (円)</th>
        <th>納期</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{name}}<br><span class="sub">{{code}}</span></td>
        <td>{{order_type}}</td>
        <td class="right">{{quantity}}</td>
        <td class="right">{{unit_price}}</td>
        <td class="right">{{amount}}</td>
        <td>{{delivery_date}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>小計</td><td>¥ {{totals.subtotal}}</td></tr>
      <tr><td>消費税（10%）</td><td>¥ {{totals.tax}}</td></tr>
      <tr class="grand-total"><td>受注金額合計（税込）</td><td>¥ {{totals.grand_total}}</td></tr>
    </table>
  </div>

  <div>
    <div class="notes-label">備考</div>
    <div class="notes">{{notes}}</div>
  </div>

  <div class="footer">
    {{doc.number}} 　 1 / 1
  </div>

</body>
</html>
`;export{t as default};
