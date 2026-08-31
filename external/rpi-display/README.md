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
        ├── 未登録 → QR + 登録コードを出して待つ
        └── 登録済 → 割り当てられた表示内容
```

**台ごとの設定を Pi に持たせない**のが芯。持たせた瞬間、台数ぶんの設定が現場に
散り、「この Pi はどこ用だったか」を人が覚えることになる。全台まったく同じ
イメージ・同じ URL で、どの画面かは電源投入後に QR を読んで決める。

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

## 触ると壊れるところ

- **Chromium のプロファイルを消さない / `--incognito` を付けない。** 登録トークンは
  Cookie にあるので、消すと再起動のたびにペアリングからやり直しになる。
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
必要は無い — それは管理画面（SY0I）から。
