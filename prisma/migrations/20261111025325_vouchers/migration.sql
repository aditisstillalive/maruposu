-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "voucher_code" TEXT,
ADD COLUMN     "voucher_discount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Voucher" (
    "code" TEXT NOT NULL,
    "batch_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "min_spend" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "channels" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "used_channel" TEXT,
    "used_ref" TEXT,
    "used_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "detail" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMP(3),
    "handled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherSyncCursor" (
    "id" TEXT NOT NULL,
    "since" TEXT,
    "after_code" TEXT,
    "pulled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voucher_status_channels_idx" ON "Voucher"("status", "channels");

-- CreateIndex
CREATE INDEX "Voucher_updated_at_idx" ON "Voucher"("updated_at");

-- CreateIndex
CREATE INDEX "VoucherRedemption_state_next_attempt_at_idx" ON "VoucherRedemption"("state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_code_order_id_key" ON "VoucherRedemption"("code", "order_id");

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
