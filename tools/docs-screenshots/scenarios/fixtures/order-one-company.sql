-- order-one-company.sql — 「1 社にしか属さない人」を用意する（company-tsp.sql のあとに流す）。
--
-- 担当者 demo2 を F01 本社工場（CKK）だけに所属させる。承認者 demo_shot はシードの
-- とおり F01・F02 の両方に所属 = CKK と TSP の 2 社にまたがる人。
INSERT INTO app.user_plants (user_id, plant_id)
SELECT u.id, p.id
  FROM app.users u, app.plants p
 WHERE u.username = 'demo2' AND p.code = 'F01';
