#!/usr/bin/env bash
# codebase-memory の索引を origin/dev に貼り直す（CLAUDE.md「Code memory」節）。
#
# SessionStart フックから背景で呼ばれる。**何が起きても黙って 0 で返る** —
# 索引はあれば速くなる道具で、無くても作業は続く。ここで失敗を叫ぶと
# セッションの開始が毎回汚れるだけで、直す動機にはならない。
set -uo pipefail

BIN="${CBM_BIN:-$HOME/.local/bin/codebase-memory-mcp}"
WORKTREE="${CBM_DEV_WORKTREE:-$HOME/.local/share/ckk-index/ckk-tool-v3-dev}"
PROJECT="${CBM_PROJECT:-ckk-tool-v3-dev}"

# 入れていないマシン（同僚・CI）では何もしない。索引は個人の道具で、
# リポジトリの依存ではない。
[ -x "$BIN" ] || exit 0
# 索引専用 worktree。git worktree なので .git は「ファイル」— -d ではなく -e。
[ -e "$WORKTREE/.git" ] || exit 0

# セッションを 3 つ開けばフックも 3 つ走る。同じ索引を同時に書かせない。
LOCK="${TMPDIR:-/tmp}/cbm-${PROJECT}.lock"
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

git -C "$WORKTREE" fetch --quiet origin dev || exit 0
# この worktree は索引専用なので、取り込みは常に「origin/dev に合わせる」。
# 履歴も作業も持たないため、進める/戻すの区別が要らない。
# 汚れていて切り替えられなければ何もしない — 索引が古いままなのは
# 間違った索引を作るより安全で、index_status を見れば判る。
git -C "$WORKTREE" checkout --detach --quiet FETCH_HEAD || exit 0

"$BIN" cli index_repository --repo-path "$WORKTREE" --name "$PROJECT" >/dev/null 2>&1 || exit 0
