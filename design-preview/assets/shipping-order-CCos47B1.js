const n=`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>出荷書</title>
  <link rel="stylesheet" href="base.css" />
</head>
<body>

  <div class="header">
    <div class="doc-title">出荷書</div>
    <div class="issuer">
      <strong>{{issuer.name}}</strong><br>
      {{issuer.address}}<br>
      {{issuer.tel}}<br>
      発行日: {{issuer.issued_date}}
    </div>
  </div>

  <div class="meta-row">
    <div class="recipient-block">
      <div class="recipient-name">{{recipient.name}}　<span class="onchu">御中</span></div>
      <div class="recipient-meta">
        {{recipient.address}}<br>
        担当: {{recipient.contact}}
      </div>
    </div>
    <div class="doc-info">
      <table>
        <tr><td>出荷日</td><td>{{doc.ship_date}}</td></tr>
        <tr><td>受注書番号</td><td>{{doc.order_number}}</td></tr>
        <tr><td>指示書番号</td><td>#{{doc.lot_number}}</td></tr>
        <tr><td>担当者</td><td>{{doc.staff}}</td></tr>
      </table>
    </div>
  </div>

  <div class="strip row">
    <span class="badge">{{delivery_type_label}}</span>
    <span>{{delivery_type_note}}</span>
  </div>

  <div class="card" style="margin-bottom: 16pt">
    <h4>関連情報</h4>
    <div class="kv"><span class="k">受注先</span><span class="v">{{info.customer}}</span></div>
    <div class="kv"><span class="k">受注書番号</span><span class="v">{{info.order_number}}</span></div>
    <div class="kv"><span class="k">指示書番号</span><span class="v">#{{info.lot_number}}</span></div>
    <div class="kv"><span class="k">ロット番号</span><span class="v">#{{info.lot_number}}</span></div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40%">製品</th>
        <th class="center">ロット番号</th>
        <th class="right">数量</th>
        <th>単位</th>
        <th>備考</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{name}}<br><span class="sub">{{code}}</span></td>
        <td class="center">#{{lot_number}}</td>
        <td class="right">{{quantity}}</td>
        <td>{{unit}}</td>
        <td>{{item_notes}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr class="grand-total"><td>出荷数量合計</td><td>{{total_quantity}} {{total_unit}}</td></tr>
    </table>
  </div>

  <div>
    <div class="notes-label">備考</div>
    <div class="notes">{{notes}}</div>
  </div>

  <div class="footer">
    出荷書　{{doc.order_number}} 　 Lot #{{doc.lot_number}} 　 1 / 1
  </div>

</body>
</html>
`;export{n as default};
