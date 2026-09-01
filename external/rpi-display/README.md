# rpi-display — 現場の管理ディスプレイ（Raspberry Pi）

現場の壁掛けテレビに生産状況などを映すための Raspberry Pi。**IT 向けの覚書**で、
現場・事務の人向けの手順は DC02 管理マニュアル
「[ディスプレイの設置（Raspberry Pi）](/admin-manual/ja/system/display-setup)」。

## 設計

Pi は**ブラウザ以上のことをしない**。電源を入れると Chromium が固定 URL を開き、
そこから先は全部 Web アプリ（`/display`）が決める。

```
Raspberry Pi
└── Chromium --kiosk
    └── https://ckk-kiosk.kai-lab.net/display
        ├── 未登録 → リンクコードを出して待つ（共有端末と同じ手順）
        └── 登録済 → その画面に設定された内容
```

**台ごとの設定を Pi に持たせない**のが芯。持たせた瞬間、台数ぶんの設定が現場に
散り、「この Pi はどこ用だったか」を人が覚えることになる。全台まったく同じ
イメージ・同じ URL で、どの画面かは電源投入後にリンクコードで決める。

## スクリプトの置き場

実体は **`coolify/apps/nextjs-kiosk/public/rpi/`**（アプリが配信するので、
Pi が `curl` で取りに来られる。APK を `public/apk/` から配るのと同じ）。

| ファイル | 役割 |
|---|---|
| `install.sh` | 1 回だけ流す導入。chromium 導入 + 自動起動 + 画面ブランク停止 |
| `ckk-display.sh` | Chromium を開き続けるラッパ（落ちたら開き直す） |

配信 URL:

| 環境 | 導入コマンド |
|---|---|
| 本番 | `curl -fsSL https://ckk-kiosk.kai-lab.net/rpi/install.sh \| bash` |
| 検証 | `curl -fsSL https://ckk-kiosk-dev.kai-lab.net/rpi/install.sh \| bash -s -- --dev` |

`src/proxy.ts` の matcher から `rpi/` を除外してある。まだ Cookie を持たない Pi が
取りに来るので、守るとリダイレクト先の HTML がシェルに流れ込む。

## 1 台で複数のテレビ

Pi 5 は HDMI が 2 口。`install.sh --screens 2` で、**画面ごとに独立した
Chromium** が立ち上がる。

```
~/.config/ckk-display/
  env                  URL と画面数（1 か所だけ）
  screen-1/            画面 1 のプロファイル（= Cookie = 身分）
  screen-2/            画面 2 のプロファイル
systemd --user
  ckk-display@1.service
  ckk-display@2.service   （テンプレートユニット %i = 画面番号）
```

**プロファイルを分けるのが要点。** Cookie が別になるので、サーバーからは
「たまたま同じ箱に入っている 2 枚の画面」に見え、表示内容も倍率も 1 枚ずつ
決まる。共有すると 2 枚とも同じものが映り、片方を失効させると両方止まる。

ロックも画面ごと（`ckk-display-<n>.lock`）。台ごとに 1 本にすると 2 枚目が
起動できない。

どのモニタに出すかは、そのモニタ内の座標を `--window-position` で渡して
全画面にさせている。並びは X11 なら `xrandr --listmonitors`、Wayland なら
`wlr-randr` から読む。**外れることがある**ので、そのときは環境ファイルに
`CKK_DISPLAY_POSITION=1920,0` のように書いて明示するか、HDMI ケーブルを
差し替えるほうが早い。

Pi は URL に `?machine=<hostname>&screen=<n>&of=<総数>` を載せる。管理画面は
これを「どの箱の何枚目か」の**手掛かり**として控えるだけで、認証には使わない
（詐称できる値なので）。2 枚まとめて消えたら箱、1 枚だけならケーブルか
テレビ側、という切り分けに使う。

## 触ると壊れるところ

- **Chromium のプロファイルを消さない / `--incognito` を付けない。** 登録トークンは
  Cookie にあるので、消すと再起動のたびにリンクからやり直しになる。
  なお Cookie が飛んでも、localStorage の deviceId が残っていれば
  `/api/display/setup/reactivate` が自動で復帰させる（共有端末と同じ）。
- **自動起動は 2 系統**（systemd --user と `~/.config/autostart`）。Bookworm 以降の
  既定は Wayland で、セッションの種類によってどちらが効くかが変わるため両方置く。
  `ckk-display.sh` の `flock` が二重起動を防いでいるので、片方だけ消さないこと。
- **URL は `~/.config/ckk-display/env` の 1 行だけ**。スクリプト本体を書き換えないのは、
  更新のたびに手で入れ直す羽目になるため。

## 推奨ハードウェア

- Raspberry Pi 5（4GB で十分。8GB は複数画面を将来足すとき）
- 純正電源（電圧不足は「たまに落ちる」という一番調べにくい症状になる）
- 有線 LAN を優先（Wi-Fi でも動くが、切れたときの復帰が遅い）
- microSD は高耐久（アプリケーションクラス A2）。書き込みは少ないが、
  安いカードは数か月で壊れる

## まとめて作る（イメージ複製）

1 台を `install.sh` まで通し、**登録する前に**電源を落として microSD を吸い出す。

```bash
# Mac から（カードリーダーに挿した状態で）
diskutil list                       # /dev/diskN を確認
sudo dd if=/dev/rdiskN of=ckk-display.img bs=4m
```

以後はこのイメージを焼くだけで、ターミナルを使わずに増やせる。**登録前の状態を
焼くこと** — 登録後のカードを複製すると、全台が同じトークンを持ってしまい、
1 台を失効させると全部が止まる。

イメージには Wi-Fi の資格情報が入らない（Imager が書き込む領域は焼き直しで
上書きされる）ので、Wi-Fi を使う拠点では Imager の設定を毎回入れるか、
有線にする。

## 更新

`install.sh` を流し直せば同じ状態になる（冪等）。表示内容の変更に Pi を触る
必要は無い — それは端末管理（SY09）の「ディスプレイ」タブから。

登録の手順は共有端末（タブレット）とまったく同じ 3 段（作る → リンク →
有効化）で、リンクコードの形式（12桁）も SY09 のスキャナも共有している。
