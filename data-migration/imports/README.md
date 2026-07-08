# Legacy import artifacts（コミット済み・DB リセット時は必ず適用）

`mapped.sqlite`（FileMaker 移行の最終形）から生成した **app スキーマ向けの
冪等 upsert SQL**。DB を初期化・再構築したら、マイグレーション適用後に
**必ず**これを流す:

```bash
cd shared-db && pnpm import:legacy     # imports/*.sql.gz を番号順に適用
```

| file | contents |
|---|---|
| `010_bp.sql.gz` | 取引先 459 社（BP-01001〜、match_names=全表記ゆれ、ロール、SUPPLIER attrs、BP 採番カウンタ前進） |
| `020_material_types.sql.gz` | 材種プレースホルダ ~3,555（レガシー材種フリーテキスト。id は SERIAL、legacy_key=uuid5 が冪等キー、code は NULL） |
| `025_material_structuring.sql.gz` | レガシー材種の構造化: 仮メーカー Z + グレード ~79 + 構造化材種 ~104 + 素材 ~525。変換済みプレースホルダは is_active=false（description に変換先コード） |
| `030_products.sql.gz` | 製品 ~43,444（型番形状/形状/刃数、spec JSON、material_id null、コード未採番 — legacy_key=uuid5 が冪等キー） |
| `999_audit_backfill.sql.gz` | 監査ログ backfill: 上記で投入した現行マスタ（取引先/材種/素材/製品）＋価格表エントリ各行に SEED 監査行（actor=システム）を生成し、詳細「履歴」タブ・操作履歴一覧を実データに沿わせる。生きているテーブルから SELECT するため mapped.sqlite 不要。record_id は各画面が参照するキー（BP=uuid, マスタ=内部 id::text, 価格表=PRC-YYYYMM-NNNNN）に一致。~48,000 行（うち製品 ~43,444） |

すべて `INSERT … ON CONFLICT DO UPDATE/NOTHING` または `WHERE NOT EXISTS` — 再適用しても安全。
`999_audit_backfill` は 010–030 の後に流れる前提（番号順）で、投入済みマスタを参照する。

再生成（mapped.sqlite を持つマシンで）: `../make_imports.sh`
025 だけの再生成（コミット済み 020 から、どのマシンでも）: `python3 ../export_material_structuring.py`
999 は静的 SQL（`../audit_backfill.sql`）を gzip するだけ: `gzip -9 -n -c ../audit_backfill.sql > 999_audit_backfill.sql.gz`
mapped.sqlite の再構築手順: `../MIGRATION_REPORT.md`
