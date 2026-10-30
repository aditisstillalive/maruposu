-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "client_expected" INTEGER,
ADD COLUMN     "close_note" TEXT,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by" TEXT,
ADD COLUMN     "closed_via" TEXT,
ADD COLUMN     "counted_cash" INTEGER,
ADD COLUMN     "denominations" JSONB,
ADD COLUMN     "expected_cash" INTEGER,
ADD COLUMN     "summary" JSONB,
ADD COLUMN     "sync_note" TEXT,
ADD COLUMN     "variance" INTEGER;
