/**
 * Migrates BookingFinancial from legacy columns (totalCost, basicSaleValue, …)
 * to the new deal-value fields before `prisma db push`.
 * Safe to run repeatedly — no-ops when already migrated.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnNames(table: string) {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
  return new Set(rows.map((r) => r.name));
}

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='BookingFinancial'`,
  );
  if (!tables.length) {
    console.log("BookingFinancial missing — prisma db push will create it");
    return;
  }

  const cols = await columnNames("BookingFinancial");
  if (cols.has("totalDealValue") && cols.has("dealValueWithoutGst")) {
    console.log("BookingFinancial already on new schema");
    return;
  }

  if (!cols.has("totalCost") && !cols.has("basicSaleValue")) {
    console.log("BookingFinancial has unknown shape — skipping SQL migrate");
    return;
  }

  console.log("Migrating BookingFinancial → totalDealValue / dealValueWithoutGst …");

  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF`);
  await prisma.$executeRawUnsafe(`BEGIN`);
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "BookingFinancial_new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bookingId" TEXT NOT NULL,
        "totalDealValue" REAL NOT NULL,
        "dealValueWithoutGst" REAL NOT NULL,
        "gst" REAL NOT NULL DEFAULT 0,
        "discount" REAL NOT NULL DEFAULT 0,
        "receivedPayment" REAL NOT NULL DEFAULT 0,
        "pendingAmount" REAL NOT NULL DEFAULT 0,
        CONSTRAINT "BookingFinancial_bookingId_fkey"
          FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    const hasBasic = cols.has("basicSaleValue");
    const hasDiscount = cols.has("discount");
    const hasGst = cols.has("gst");

    await prisma.$executeRawUnsafe(`
      INSERT INTO "BookingFinancial_new" (
        "id", "bookingId", "totalDealValue", "dealValueWithoutGst",
        "gst", "discount", "receivedPayment", "pendingAmount"
      )
      SELECT
        "id",
        "bookingId",
        COALESCE("totalCost", 0),
        COALESCE(${hasBasic ? `"basicSaleValue"` : `"totalCost"`}, COALESCE("totalCost", 0)),
        COALESCE(${hasGst ? `"gst"` : "0"}, 0),
        COALESCE(${hasDiscount ? `"discount"` : "0"}, 0),
        ROUND(COALESCE("totalCost", 0) * 0.1),
        MAX(0, COALESCE("totalCost", 0) - ROUND(COALESCE("totalCost", 0) * 0.1))
      FROM "BookingFinancial"
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE "BookingFinancial"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BookingFinancial_new" RENAME TO "BookingFinancial"`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "BookingFinancial_bookingId_key" ON "BookingFinancial"("bookingId")`,
    );
    await prisma.$executeRawUnsafe(`COMMIT`);
  } catch (err) {
    await prisma.$executeRawUnsafe(`ROLLBACK`);
    throw err;
  } finally {
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=ON`);
  }

  console.log("BookingFinancial migration complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
