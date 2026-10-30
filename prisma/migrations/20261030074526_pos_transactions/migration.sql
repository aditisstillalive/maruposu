-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "scope" TEXT NOT NULL,
    "product_ids" TEXT[],
    "category_ids" TEXT[],
    "min_spend" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "days" INTEGER[],
    "time_start" TEXT,
    "time_end" TEXT,
    "quota" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "business_date" TEXT NOT NULL,
    "opening_float" INTEGER NOT NULL,
    "opened_by" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "refund_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "business_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "order_type" TEXT NOT NULL,
    "customer_name" TEXT,
    "table_no" TEXT,
    "created_by" TEXT NOT NULL,
    "paid_by" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "promo_id" TEXT,
    "promo_name" TEXT,
    "payment_method" TEXT,
    "cash_received" INTEGER,
    "change" INTEGER,
    "payment_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_by" TEXT,
    "voided_at" TIMESTAMP(3),
    "sync_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "base_price" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" TEXT,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "refunded_qty" INTEGER NOT NULL DEFAULT 0,
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemOption" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "option_id" TEXT,
    "group_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta" INTEGER NOT NULL,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundItem" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosMutation" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promo_outlet_id_code_key" ON "Promo"("outlet_id", "code");

-- CreateIndex
CREATE INDEX "Shift_outlet_id_status_idx" ON "Shift"("outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_refund_id_key" ON "CashMovement"("refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_shift_id_status_idx" ON "Order"("shift_id", "status");

-- CreateIndex
CREATE INDEX "Order_business_date_idx" ON "Order"("business_date");

-- AddForeignKey
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
