"""python-syntax.py — リポジトリ内の Python を**構文だけ**確かめる（CI 用）。

対象は `coolify/` 配下のサービス（admintools / intake-gateway / po-extract /
kot-import / 監視の exporter ほか）。どれも Coolify か deploy-stack.sh が
イメージを組んで初めて動くので、構文誤りは **merge 後のデプロイで初めて落ちる**。
単体試験があるのは 2 つだけ（intake-gateway / admintools）で、残りはこれが唯一の網。

依存を入れずに済むよう import はしない — `ast.parse` で読むだけ。
`compileall` を使わないのは .pyc を書こうとするため（読み取り専用の場所で落ちる）。

使い方（リポジトリルート）: python tools/ci/python-syntax.py
"""

import ast
import pathlib
import subprocess
import sys

files = subprocess.run(
    ["git", "ls-files", "coolify/*.py", "coolify/**/*.py"],
    check=True,
    capture_output=True,
    text=True,
).stdout.split()
files = sorted(set(files))

broken = []
for name in files:
    try:
        ast.parse(pathlib.Path(name).read_text(encoding="utf-8"), filename=name)
    except SyntaxError as e:
        broken.append(f"{name}:{e.lineno}: {e.msg}")

for line in broken:
    print(f"::error::{line}")
print(f"{len(files)} files checked, {len(broken)} with syntax errors")
sys.exit(1 if broken else 0)
