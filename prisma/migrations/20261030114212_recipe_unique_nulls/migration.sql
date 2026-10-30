-- A recipe line belongs to a product OR an option, so one of the two columns is
-- always NULL. Postgres treats NULLs as distinct, so the plain unique index never
-- stopped a duplicate; NULLS NOT DISTINCT (PG15+) makes it count.
DROP INDEX "RecipeLine_product_id_option_id_ingredient_id_key";
CREATE UNIQUE INDEX "RecipeLine_product_id_option_id_ingredient_id_key"
  ON "RecipeLine"("product_id", "option_id", "ingredient_id") NULLS NOT DISTINCT;
