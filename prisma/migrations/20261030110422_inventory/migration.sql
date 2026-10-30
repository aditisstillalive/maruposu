-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "cogs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "purchase_unit" TEXT,
    "purchase_size" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "avg_cost_milli" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "product_id" TEXT,
    "option_id" TEXT,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost_milli" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "total" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "total_cost" INTEGER NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOpname" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOpname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOpnameLine" (
    "id" TEXT NOT NULL,
    "opname_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "diff" INTEGER NOT NULL,

    CONSTRAINT "StockOpnameLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waste" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteLine" (
    "id" TEXT NOT NULL,
    "waste_id" TEXT NOT NULL,
    "ingredient_id" TEXT,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "WasteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_outlet_id_name_key" ON "Ingredient"("outlet_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_product_id_option_id_ingredient_id_key" ON "RecipeLine"("product_id", "option_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "StockMovement_ingredient_id_created_at_idx" ON "StockMovement"("ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "StockMovement_ref_type_ref_id_idx" ON "StockMovement"("ref_type", "ref_id");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOpnameLine" ADD CONSTRAINT "StockOpnameLine_opname_id_fkey" FOREIGN KEY ("opname_id") REFERENCES "StockOpname"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteLine" ADD CONSTRAINT "WasteLine_waste_id_fkey" FOREIGN KEY ("waste_id") REFERENCES "Waste"("id") ON DELETE CASCADE ON UPDATE CASCADE;
