# weblate — 翻訳の管理画面

`coolify/apps/nextjs-web/messages/{ja,en,zh}.json` を人が訳すための面。
アプリの文言は**この 3 ファイルが全て**なので、Weblate に渡すのもこれだけ。

- UI: `http://192.168.50.15:8080`
- 建て方: **`deploy-stack.sh`**（Coolify 管理ではない — 理由は
  `docker-compose.yml` の冒頭）

```bash
cd coolify/common
./deploy-stack.sh weblate --dry-run   # 送るファイルを先に見る
./deploy-stack.sh weblate
```

初回はサーバーに `.env` を置いてから（`.env.example` を写して埋める）。
`.env` は**サーバーにしか無い**（deploy-stack.sh が常に除外する）。

**データ用ディレクトリの所有者を先に直すこと** — weblate は uid 1000 で走る:

```bash
sudo mkdir -p /data/weblate/{postgres,data,cache,redis}
sudo chown -R 1000:1000 /data/weblate/data /data/weblate/cache
```

これを飛ばすと `/app/data volume is not writable` で**起動ループ**になる
（`docker ps` に Restarting と出るだけで、原因は `docker logs weblate` にしか
出ない）。

## コンポーネントの設定（画面から 1 回だけ）

| 項目 | 値 |
|---|---|
| Repository | `https://github.com/Kuisin/ckk-tool-v3.git` |
| Branch | `dev` |
| **Push branch** | **`weblate-translations`** |
| File mask | `coolify/apps/nextjs-web/messages/*.json` |
| Monolingual base file | `coolify/apps/nextjs-web/messages/ja.json` |
| Base file for new translations | `coolify/apps/nextjs-web/messages/ja.json` |
| File format | `JSON nested structure` |
| Source language | `Japanese` |

**`dev` へ直接 push させないこと。** リポジトリの決まりで dev / main への直接
コミットは禁止（`CLAUDE.md`）。Push branch を分けておけば、Weblate は
`weblate-translations` に積んで **PR を開く**ので、いつもの流れに乗る。

## 何が翻訳対象になるか

`messages/*.json` の中身は 3 種類あるが、Weblate から見ればどれも同じ鍵と値:

| 名前空間 | 中身 | 備考 |
|---|---|---|
| `common` / `shell` / … | 変数を含む文 | next-intl が ICU で処理する |
| `enum` / `status` / `permission` / `privilegedOp` / `pdf` | 値に付くラベル | コードは `lib/messages.ts` 経由で引くだけ |
| `ui` | 変数の無い決まり文句 | **鍵が日本語の原文そのもの**（5,378 語） |

`ui` の鍵は日本語なので、Weblate の「Source string」がそのまま読める。
`{name}` のような穴を含む値があるので、**穴は消さない / 増やさない**こと
（Weblate の「同じ変数が使われているか」チェックを有効にしておくと弾ける）。

## 訳を足したあと

Weblate の PR を `dev` に取り込めば、それがそのまま本番の文言になる
（アプリは `messages/*.json` を直接読む — 生成物や中間ファイルは無い）。

CI は 3 言語で鍵の集合が完全に一致していることを見る
（`lib/user-preferences-core.test.ts`）。片方の言語にだけ鍵を足すと落ちる。

## バックアップ

`/data/weblate/{postgres,data,cache,redis}`。翻訳そのものは git に載るので、
ここが飛んでも訳は失われない（失われるのは履歴・利用者・提案）。
