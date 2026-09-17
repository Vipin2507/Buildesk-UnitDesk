/**
 * Ensures BookingFinancial matches the current schema.
 * Migrates from any prior shape; safe to run repeatedly.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET = [
  "agreement",
  "gst",
  "otherCharges",
  "totalCost",
  "gstOnAgreement",
  "stampDutyRegistration",
  "valueToBeCollected",
  "finance",
] as const;

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
  const already = TARGET.every((c) => cols.has(c)) && !cols.has("totalDealValue") && !cols.has("basicSaleValue");
  if (already) {
    console.log("BookingFinancial already on current schema");
    return;
  }

  console.log("Migrating BookingFinancial → agreement / totalCost / valueToBeCollected …");

  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF`);
  await prisma.$executeRawUnsafe(`BEGIN`);
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "BookingFinancial_new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bookingId" TEXT NOT NULL,
        "agreement" REAL NOT NULL DEFAULT 0,
        "gst" REAL NOT NULL DEFAULT 0,
        "otherCharges" REAL NOT NULL DEFAULT 0,
        "totalCost" REAL NOT NULL,
        "gstOnAgreement" REAL NOT NULL DEFAULT 0,
        "stampDutyRegistration" REAL NOT NULL DEFAULT 0,
        "valueToBeCollected" REAL NOT NULL DEFAULT 0,
        "finance" REAL NOT NULL DEFAULT 0,
        CONSTRAINT "BookingFinancial_bookingId_fkey"
          FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    const pick = (preferred: string[], fallback = "0") => {
      for (const name of preferred) {
        if (cols.has(name)) return `"${name}"`;
      }
      return fallback;
    };

    const totalExpr = pick(["totalCost", "totalDealValue"], "0");
    const agreementExpr = pick(["agreement", "dealValueWithoutGst", "basicSaleValue", "agreementValue"], totalExpr);
    const gstExpr = pick(["gst"], "0");
    const otherExpr = pick(["otherCharges"], "0");
    const gstOnAgrExpr = pick(["gstOnAgreement"], "0");
    const stampExpr = pick(
      ["stampDutyRegistration"],
      cols.has("stampDuty") && cols.has("registration")
        ? `COALESCE("stampDuty",0)+COALESCE("registration",0)`
        : pick(["stampDuty", "registration"], "0"),
    );
    const collectExpr = pick(
      ["valueToBeCollected", "pendingAmount"],
      cols.has("totalDealValue") && cols.has("receivedPayment")
        ? `MAX(0, COALESCE("totalDealValue",0)-COALESCE("receivedPayment",0))`
        : totalExpr,
    );
    const financeExpr = pick(["finance", "financedComponent"], "0");

    await prisma.$executeRawUnsafe(`
      INSERT INTO "BookingFinancial_new" (
        "id", "bookingId", "agreement", "gst", "otherCharges", "totalCost",
        "gstOnAgreement", "stampDutyRegistration", "valueToBeCollected", "finance"
      )
      SELECT
        "id",
        "bookingId",
        COALESCE(${agreementExpr}, 0),
        COALESCE(${gstExpr}, 0),
        COALESCE(${otherExpr}, 0),
        COALESCE(${totalExpr}, 0),
        COALESCE(${gstOnAgrExpr}, 0),
        COALESCE(${stampExpr}, 0),
        COALESCE(${collectExpr}, 0),
        COALESCE(${financeExpr}, 0)
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
