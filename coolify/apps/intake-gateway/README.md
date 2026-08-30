# intake-gateway — 注文請書のメール取込

受信箱を巡回して、注文書の添付を **取込フォルダ（`INTAKE_DIR`）へ置く**だけの
サイドカー。採番も抽出も突合もしない — それは nextjs-web 側のポーラーが
（共有フォルダに人が直接置いたときと寸分違わぬ経路で）やる。

```
メール受信箱 ──IMAP──> intake-gateway ──ファイル──> INTAKE_DIR
                                                      │
                                  nextjs-web のポーラー（60 秒ごと）
                                                      ↓
                              採番 ORD- → po-extract → 突合 → DRAFT
```

## なぜ別コンテナで、なぜ直接書くのか

このプロセスは**メールボックスの資格情報を持ち、外部から届く任意の添付を触る**
— システムで一番汚れた入力を扱う。だからアプリの HTTP 面に届かせない:

- アプリのトークンを持たない（`INTAKE_INBOUND_TOKEN` を渡さない）
- アプリは、メール取込のために未認証の書き込み口を開けなくて済む
- 乗っ取られてもできるのは「監視フォルダにファイルを置く」ことだけ。
  それはフォルダが設計上もともと信頼している操作で、権限の拡大にならない
- DB にも nextjs-web にも接続しないので、片方の再起動が他方に影響しない

代償は**来歴の記録が弱くなる**こと（下記「制約」）。承知のうえで取っている。

（`POST /api/intake/inbound` という機械向けの投入口もアプリ側にあるが、
このゲートウェイは**使わない**。あちらは FAX 事業者の webhook など、
フォルダを共有できない相手のための口。）

## 依存

**IMAP と MIME の解釈は Python 標準ライブラリ**（`imaplib` / `email`）。
日本語メールのファイル名 — RFC 2047 の encoded-word、RFC 2231 の分割、
ISO-2022-JP / Shift_JIS — を正しく読めることが選定理由で、ここは自前実装が
壊れる場所。npm 側には何も足していない。

`requirements.txt` の 2 つは **TIFF → PDF 変換のためだけ**:

- `img2pdf` … FAX の TIFF はたいてい CCITT G4 で、これを**再エンコードせず
  そのまま PDF に埋める**。画質の劣化がゼロで出来上がりも小さい
  （Pillow で開いて描き直すと 2 値が潰れる）
- `pillow` … img2pdf が扱えない TIFF の受け皿

## 責務の境界

| モジュール | 持つもの |
|---|---|
| `parts.py` | **何を添付とみなすか**・ファイル名の組み立て（純粋・テストの中心） |
| `writer.py` | **フォルダへの安全な書き込み**（`.part` → rename・一意化） |
| `convert.py` | TIFF → PDF |
| `mailbox.py` | IMAP の入出力だけ（判断を持たない） |
| `runner.py` | 巡回ループと「完了」の記録の仕方 |
| `config.py` | 環境変数の解決（未設定 = 無効） |

## 環境変数

| 変数 | 既定 | 意味 |
|---|---|---|
| `INTAKE_DIR` | — | 取込フォルダ。**nextjs-web と同じホストパス**をマウントする |
| `INTAKE_MAIL_HOST` | *(未設定)* | **未設定 = 機能ごと無効**（起動して待つだけ・落ちない） |
| `INTAKE_MAIL_PORT` | `993` | |
| `INTAKE_MAIL_SSL` | `1` | `0` で 143 + STARTTLS（失敗したら接続を捨てる — 平文で資格情報を送らない） |
| `INTAKE_MAIL_USER` / `INTAKE_MAIL_PASSWORD` | — | 未設定なら無効（理由をログに出す） |
| `INTAKE_MAIL_BOX` | `INBOX` | |
| `INTAKE_MAIL_PROCESSED_BOX` | `Processed` | 空なら既読にするだけで移動しない。**`INBOX.` は書かない** — サーバーの名前空間はコードが聞いて自動で足す（下記） |
| `INTAKE_MAIL_FAILED_BOX` | *(未設定)* | 一部失敗したメールの退避先。同上 |
| `INTAKE_MAIL_POLL_SECONDS` | `120` | |
| `INTAKE_MAIL_MAX_MESSAGES` | `20` | 1 巡あたり |
| `INTAKE_MAIL_SINCE_DAYS` | `7` | 初回起動時の暴走よけ（未読が溜まった受信箱を一気に舐めない） |
| `INTAKE_MAIL_ALLOW_FROM` | *(未設定)* | 許可する送信元のカンマ区切り（`@example.co.jp` のようにドメインでも可）。未設定は全部受ける |
| `PYTHONUNBUFFERED` | `1` | 無いと失敗が `docker logs` に出ない |

資格情報は **Coolify の env** に置く。アプリの `system_settings` +
`secret-box` は使わない — あれは人がフォームに打ち込む秘密のための仕組みで、
ここにフォームは無いし、別コンテナからは読めない。

## 「完了」の定義 — 端から端まで一度試したら完了

| 結果 | 扱い |
|---|---|
| 受理した添付を全部書けた | `\Seen` + 処理済みフォルダへ移動 |
| 受理できる添付が 0（本文だけ・署名だけ） | `\Seen`、移動しない（人が受信箱で見つけられるように） |
| 一部だけ成功 | `\Seen`（**再送しない**）+ 大きくログ + 失敗フォルダへ |
| 接続・認証・マウント不可 | 未読のまま。その巡回ごと中断 |

**意図的な取引**: 取込フォルダに二重に落ちた注文書を後から片付けるコストの
ほうが、落ちなかった添付を人に再送してもらうコストより高い。半分成功した
メールを再試行すれば重複は確定するのに、添付単位の冪等キーは存在しない。

**フラグは移動より先に打つ。** 移動に失敗しても、次回の `UNSEEN` 検索からは
外れる。フラグが正しさの機構で、移動は受信箱の衛生の機構。

## 落とし穴

- **uid/gid（最大のリスク）** — 取込フォルダは nextjs-web と共有する。
  このイメージは向こうと同じ **1001:1001** で走る。ホスト側も揃えること:
  `sudo chown -R 1001:1001 <取込フォルダ>`。ずれると EACCES で黙って止まり、
  画面では「取込待ちのまま動かない」としか見えない。
  **dev の実際の配置**（2026-08-30 実測・疎通確認済み）:
  host `/home/kaiseisawada/intake/orders` → container `/data/intake`、
  `INTAKE_DIR=/data/intake`。フォルダは 0777、`processed/`・`failed/` は
  uid 1001 所有。nextjs-web-dev と intake-gateway-dev が同じホストパスを見る
- **フォルダに書けないまま受信を始めない** — 全部失敗し、それでも既読が付く
  ＝注文書が黙って消える。だから起動時に `ensure_writable` で確かめ、
  駄目なら**ポーリングを始めずに終了する**
- **dev と main で受信箱を分ける** — 同じ受信箱を 2 つのコンテナが読むと、
  どちらが先に既読を打つかで取り合いになる
- **処理済みフォルダを設定する** — 未設定だと既読メールが受信箱に積み上がる
- **フォルダ名の名前空間はサーバーによって違う** — Sakura（Courier 系）は
  NAMESPACE が `(("INBOX." "."))` を返し、`Processed` は
  **`Invalid mailbox name.`** で作れない（`INBOX.Processed` でなければ通らない）。
  実機で踏んで、処理済みメールが受信箱に溜まり続けた。設定に `INBOX.` を書くと
  Dovecot 系（personal prefix が空）へ持っていけなくなるので、**接続時に
  NAMESPACE を聞いて足す**（`mailbox.qualify_box`）。env は素の `Processed` のまま
- **`ORD-` で始まる名前を作らない** — その接頭辞は「採番済みの続き」の目印で、
  付けると別の注文請書の続きだと誤認される（`writer.py` が強制）

## 制約 — 来歴は DB に残らない

すべて取込フォルダに着地するので、取込は `source: "FOLDER"` になる。さらに
このコンテナは DB に書かないため、**送信元・件名・Message-ID はデータベースの
どこにも入らない**。残る痕跡は 2 つだけ:

1. ファイル名の中の `mail_{送信元}_` 断片（SY0C の取込待ち一覧、および
   `ORD-...` に改名された後のファイル名に残り続ける）
2. このコンテナの標準出力（`docker logs` / Loki）

SA04 の注文請書詳細からは辿れないし、「この取引先から来たメール」を SQL で
問い合わせることもできない。直すなら `IntakeSource` に `MAIL` を足して
`intake_messages` を作ることになる（今回は範囲外）。

## テスト

```bash
cd coolify/apps/intake-gateway
python -m unittest discover -s tests -t .
```

依存ゼロで走る（img2pdf / Pillow が無い環境では TIFF のテストだけ飛ぶ）。
IMAP サーバーは使わない — `mailbox` の入出力を差し替えている。

実サーバーが要るもの（＝手動、CI に入れない）: 接続・TLS・`UNSEEN` の意味・
既読と移動の順序・`UIDVALIDITY` の変化・**uid/gid の相互運用**。

### 手動スモーク（dev）

```bash
# 1. 共有フォルダの相互運用（これを最初にやる）
docker exec intake-gateway-dev python -c \
  "from gateway.writer import ensure_writable, write_to_intake; ensure_writable('/data/intake'); \
   print(write_to_intake('/data/intake','probe.pdf', b'%PDF-1.4\n'))"
docker exec <nextjs-web-dev> ls -la /data/intake
#    → 60 秒以内に ORD-... へ改名され processed/ へ移ること。EACCES が出ないこと

# 2. PDF 1 枚 + HTML 署名にロゴを入れたメールを送る
docker logs -f intake-gateway-dev     # 1 通・1 ファイル（ロゴは落ちている）
#    → SY0C /settings/order-intake の「取込待ち」に mail_送信元_... が現れる
#    → 60 秒後 SA04 の一覧に IMPORT → DRAFT
#    → 受信箱側は既読 + Processed へ移動

# 3. 添付なしのメール    → 既読になるが取込 0 件・受信箱に残る
# 4. コンテナを止めて送信 → 起動後に取りこぼしていないこと
```

## デプロイ

Coolify 管理・環境別・内部専用（ホストポートも公開ドメインも無い）。
登録は `coolify/platform/add-intake-gateway-apps.sh`（冪等 — アプリ作成 /
ビルド設定 / env / バインドマウント / デプロイキーまで全部やる）、
デプロイは `coolify/platform/deploy.sh intake-gateway-dev|intake-gateway-main`。

登録スクリプトが自動でやる 2 つの落とし穴:

- **バインドマウント** — `/storages` の `type` は `persistent|file` の 2 択
  （`bind` / `volume` は Validation failed）だが、**`persistent` に `host_path`
  を渡すとバインドマウントになる**。名前付きボリュームは Coolify が
  `<appUUID>_<name>` に改名するのでアプリ間で共有できず、ここでは使えない
- **デプロイキー** — `/applications/public` で作ると組み込みの「Public GitHub」に
  紐づき、非公開リポジトリを匿名 HTTPS で clone しようとして
  `could not read Username for 'https://github.com'` で落ちる。
  `private_key_id` は REST API では設定できない（"This field is not allowed."）ので
  スクリプトが `coolify-db` へ直接 UPDATE する

**dev は疎通確認済み**（2026-08-30）。**main は取込フォルダ自体がまだ無い** —
`nextjs-web-main` に `INTAKE_DIR` も storages も無いので、本番で動かすには
先にフォルダ作成（`chown 1001:1001`）+ 両アプリへのマウント + env が要る。
