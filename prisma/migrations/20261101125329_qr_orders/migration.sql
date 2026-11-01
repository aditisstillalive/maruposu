-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "qr_activity_at" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'pos',
ADD COLUMN     "table_id" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'pos';

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_token_key" ON "DiningTable"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_outlet_id_name_key" ON "DiningTable"("outlet_id", "name");

-- CreateIndex
CREATE INDEX "Order_table_id_status_idx" ON "Order"("table_id", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
