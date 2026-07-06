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
| `020_material_types.sql.gz` | 材種プレースホルダ ~3,555（レガシー材種フリーテキスト、採番表コード未変換） |
| `030_products.sql.gz` | 製品 ~43,444（型番形状/形状/刃数、spec JSON、material_id null） |

すべて `INSERT … ON CONFLICT DO UPDATE/NOTHING` — 再適用しても安全。

再生成（mapped.sqlite を持つマシンで）: `../make_imports.sh`
mapped.sqlite の再構築手順: `../MIGRATION_REPORT.md`
