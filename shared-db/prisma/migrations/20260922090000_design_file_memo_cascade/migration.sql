-- 設計図の版 (app.design_files) にメモが付くようになったので、
-- 版を消したときに子行が残らないようにする。
--
-- design_files はこれまで「書類」ではなかったので
-- purge_children_after_delete が無い。メモは多態参照（owner_type +
-- owner_id の文字列）で FK が張れないため、トリガーが無いと
-- deleteDesignFile（手動登録・指示書未使用の版だけ消せる）でメモが孤児になる。
--
-- owner_id は版の uuid をそのまま使う（版に業務キー = 表示番号は無い）ので、
-- mode = 'col' / key = 'id'。material_receipts と同じ形。
--
-- スキーマ変更は無い（トリガーのみ）。

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.design_files
  FOR EACH ROW
  EXECUTE FUNCTION app.purge_document_children('design_files', 'col', 'id');
