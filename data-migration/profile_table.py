#!/usr/bin/env python3
"""Convert sqlite3 -csv output to a GitHub-flavored markdown table."""

from __future__ import annotations

import csv
import sys

MAX_COLS = 20
MAX_CELL = 80


def esc(value: str) -> str:
    text = value.replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip()
    if len(text) > MAX_CELL:
        return text[: MAX_CELL - 1] + "…"
    return text


def row_to_md(cells: list[str]) -> str:
    return "| " + " | ".join(esc(c) for c in cells) + " |"


def main() -> int:
    reader = csv.reader(sys.stdin)
    rows = list(reader)
    if not rows:
        return 0

    header = rows[0]
    data = rows[1:]
    total_cols = len(header)
    shown_cols = min(total_cols, MAX_COLS)
    header = header[:shown_cols]
    data = [row[:shown_cols] + [""] * max(0, shown_cols - len(row)) for row in data]

    print(row_to_md(header))
    print("| " + " | ".join("---" for _ in header) + " |")
    for row in data:
        print(row_to_md(row))

    if total_cols > MAX_COLS:
        print()
        print(f"_Showing first {MAX_COLS} of {total_cols} columns._")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
