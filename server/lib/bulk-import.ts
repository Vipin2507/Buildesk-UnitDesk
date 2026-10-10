import * as XLSX from "xlsx";
import { prisma } from "./prisma.ts";
import { cell, dateIso, num, parseCsv, toCsv } from "./csv.ts";
import { grantDefaultAccessOnProjectCreate } from "./access.ts";
import {
  addDays,
  createInstallmentSchedules,
  generateSchedules,
  recomputeCustomerCollection,
  syncInstallmentReminders,
} from "./schedule.ts";
import { computeEntitlement, recomputePartnerEntitlement, round2 } from "./commission.ts";
import { issueDocument } from "./invoice.ts";
import { audit } from "./audit.ts";
import type { AuthUser } from "../middleware/auth.ts";

export type ImportKind =
  | "companies"
  | "projects"
  | "units"
  | "bookings"
  | "installments"
  | "payments";

export type ColumnDef = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
};

export type KindMeta = {
  id: ImportKind;
  label: string;
  description: string;
  permission: string;
  columns: ColumnDef[];
  sample: Record<string, string>[];
  order: number;
};

export type RowOutcome = {
  row: number;
  status: "created" | "updated" | "skipped" | "error";
  message: string;
  key?: string;
};

export type ImportResult = {
  kind: ImportKind;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  outcomes: RowOutcome[];
};

export const IMPORT_KINDS: KindMeta[] = [
  {
    id: "companies",
    label: "Companies",
    description: "Upsert organisations by company_code",
    permission: "add",
    order: 1,
    columns: [
      { key: "company_code", label: "Company code", required: true },
      { key: "company_name", label: "Company name", required: true },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "gst", label: "GST" },
      { key: "pan", label: "PAN" },
      { key: "contact_person", label: "Contact person" },
      { key: "contact_number", label: "Contact number" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status", hint: "active | inactive" },
    ],
    sample: [
      {
        company_code: "ACME",
        company_name: "Acme Developers Pvt Ltd",
        address: "12 MG Road",
        city: "Pune",
        state: "MH",
        gst: "",
        pan: "",
        contact_person: "Rajesh",
        contact_number: "9876543210",
        email: "ops@acme.example",
        status: "active",
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    description: "Upsert projects under a company (company_code + project_code)",
    permission: "add",
    order: 2,
    columns: [
      { key: "company_code", label: "Company code", required: true },
      { key: "project_code", label: "Project code", required: true },
      { key: "project_name", label: "Project name", required: true },
      { key: "location", label: "Location" },
      { key: "address", label: "Address" },
      { key: "rera_number", label: "RERA number" },
      { key: "rera_date", label: "RERA date", hint: "YYYY-MM-DD or DD/MM/YYYY" },
      { key: "project_type", label: "Project type" },
      { key: "status", label: "Status", hint: "active | upcoming | completed | inactive" },
      { key: "launch_date", label: "Launch date" },
      { key: "expected_completion", label: "Expected completion" },
      { key: "number_format", label: "Unit number format" },
    ],
    sample: [
      {
        company_code: "ACME",
        project_code: "SKY",
        project_name: "Skyline Residences",
        location: "Baner",
        address: "Baner Road",
        rera_number: "",
        rera_date: "",
        project_type: "Residential",
        status: "active",
        launch_date: "2024-01-15",
        expected_completion: "2027-12-31",
        number_format: "[Wing]-[Floor][Unit:2]",
      },
    ],
  },
  {
    id: "units",
    label: "Units",
    description: "Create/update inventory; wings & floors are created automatically",
    permission: "add",
    order: 3,
    columns: [
      { key: "company_code", label: "Company code", required: true },
      { key: "project_code", label: "Project code", required: true },
      { key: "wing_name", label: "Wing name", required: true },
      { key: "floor_number", label: "Floor number", required: true },
      { key: "unit_number", label: "Unit number", required: true },
      { key: "unit_type", label: "Unit type", hint: "1BHK | 2BHK | …" },
      { key: "configuration", label: "Configuration" },
      { key: "carpet_area", label: "Carpet area" },
      { key: "built_up_area", label: "Built-up area" },
      { key: "saleable_area", label: "Saleable area" },
      { key: "facing", label: "Facing" },
      { key: "parking", label: "Parking" },
      { key: "base_price", label: "Base price" },
      { key: "plc", label: "PLC" },
      { key: "other_charges", label: "Other charges" },
      { key: "status", label: "Status", hint: "available | hold | blocked | …" },
      { key: "remarks", label: "Remarks" },
    ],
    sample: [
      {
        company_code: "ACME",
        project_code: "SKY",
        wing_name: "A",
        floor_number: "1",
        unit_number: "A-101",
        unit_type: "2BHK",
        configuration: "2BHK",
        carpet_area: "650",
        built_up_area: "780",
        saleable_area: "900",
        facing: "East",
        parking: "1",
        base_price: "5500000",
        plc: "0",
        other_charges: "150000",
        status: "available",
        remarks: "",
      },
    ],
  },
  {
    id: "bookings",
    label: "Bookings",
    description: "Create bookings with primary customer & financials (unit must be free)",
    permission: "book",
    order: 4,
    columns: [
      { key: "booking_number", label: "Booking number", hint: "Optional; auto if blank" },
      { key: "company_code", label: "Company code", required: true },
      { key: "project_code", label: "Project code", required: true },
      { key: "unit_number", label: "Unit number", required: true },
      { key: "booking_date", label: "Booking date", required: true },
      { key: "status", label: "Status", hint: "booked | confirmed | hold" },
      { key: "customer_name", label: "Customer name", required: true },
      { key: "customer_mobile", label: "Customer mobile", required: true },
      { key: "customer_email", label: "Customer email" },
      { key: "customer_pan", label: "Customer PAN" },
      { key: "total_cost", label: "Total cost", required: true },
      { key: "value_to_be_collected", label: "Value to be collected" },
      { key: "finance", label: "Finance / loan" },
      { key: "agreement", label: "Agreement value" },
      { key: "gst", label: "GST" },
      { key: "other_charges", label: "Other charges" },
      { key: "channel_partner_email", label: "Channel partner email" },
      { key: "remarks", label: "Remarks" },
    ],
    sample: [
      {
        booking_number: "",
        company_code: "ACME",
        project_code: "SKY",
        unit_number: "A-101",
        booking_date: "15/01/2025",
        status: "booked",
        customer_name: "Amit Sharma",
        customer_mobile: "9123456780",
        customer_email: "amit@example.com",
        customer_pan: "",
        total_cost: "5650000",
        value_to_be_collected: "5650000",
        finance: "0",
        agreement: "5500000",
        gst: "0",
        other_charges: "150000",
        channel_partner_email: "",
        remarks: "",
      },
    ],
  },
  {
    id: "installments",
    label: "Installments",
    description: "Set payment schedule for a booking (replaces empty schedules)",
    permission: "edit",
    order: 5,
    columns: [
      { key: "booking_number", label: "Booking number", required: true },
      { key: "sort_order", label: "Sort order", hint: "1, 2, 3…" },
      { key: "name", label: "Installment name", required: true },
      { key: "after_days", label: "Days after booking", hint: "0 = booking date" },
      { key: "due_date", label: "Due date", hint: "Optional override" },
      { key: "amount", label: "Amount", required: true },
    ],
    sample: [
      {
        booking_number: "BK-2025-0001",
        sort_order: "1",
        name: "Booking amount",
        after_days: "0",
        due_date: "",
        amount: "1130000",
      },
      {
        booking_number: "BK-2025-0001",
        sort_order: "2",
        name: "Slab 1",
        after_days: "90",
        due_date: "",
        amount: "1506667",
      },
      {
        booking_number: "BK-2025-0001",
        sort_order: "3",
        name: "Slab 2",
        after_days: "180",
        due_date: "",
        amount: "1506667",
      },
      {
        booking_number: "BK-2025-0001",
        sort_order: "4",
        name: "Possession",
        after_days: "270",
        due_date: "",
        amount: "1506666",
      },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    description: "Record customer/partner payments against bookings",
    permission: "payment_entry",
    order: 6,
    columns: [
      { key: "booking_number", label: "Booking number", required: true },
      { key: "payment_date", label: "Payment date", required: true },
      { key: "amount", label: "Amount", required: true },
      { key: "payment_mode", label: "Payment mode", required: true, hint: "cash | cheque | neft | rtgs | upi" },
      { key: "utr_or_cheque", label: "UTR / cheque" },
      { key: "bank", label: "Bank" },
      { key: "applies_to", label: "Applies to", hint: "customer | partner" },
      { key: "status", label: "Status", hint: "received | pending | verified" },
      { key: "remarks", label: "Remarks" },
    ],
    sample: [
      {
        booking_number: "BK-2025-0001",
        payment_date: "20/01/2025",
        amount: "500000",
        payment_mode: "neft",
        utr_or_cheque: "UTR123456",
        bank: "HDFC",
        applies_to: "customer",
        status: "received",
        remarks: "",
      },
    ],
  },
];

export function getKindMeta(kind: string): KindMeta {
  const meta = IMPORT_KINDS.find((k) => k.id === kind);
  if (!meta) throw new Error(`Unknown import kind: ${kind}`);
  return meta;
}

export function templateCsv(kind: ImportKind): string {
  const meta = getKindMeta(kind);
  const headers = meta.columns.map((c) => c.key);
  const rows = meta.sample.map((s) => headers.map((h) => s[h] ?? ""));
  return toCsv(headers, rows);
}

/** Excel sheet name for this import kind (one sheet per entity). */
export function sheetNameFor(kind: ImportKind | string) {
  return getKindMeta(kind).label.slice(0, 31);
}

export function templateXlsx(kind: ImportKind): Buffer {
  const meta = getKindMeta(kind);
  const headers = meta.columns.map((c) => c.key);
  const aoa: (string | number)[][] = [
    headers,
    ...meta.sample.map((s) => headers.map((h) => s[h] ?? "")),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetNameFor(kind));
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(out);
}

/** Extract CSV text from a single-sheet CSV or the matching sheet of an .xlsx. */
export function fileBufferToCsv(
  buffer: Buffer,
  filename: string,
  kind: ImportKind,
): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return buffer.toString("utf8");
  }
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error("Upload an .xlsx sheet or .csv file");
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const want = sheetNameFor(kind).toLowerCase();
  const kindId = kind.toLowerCase();
  const matched =
    wb.SheetNames.find((n) => n.toLowerCase() === want) ||
    wb.SheetNames.find((n) => n.toLowerCase() === kindId) ||
    wb.SheetNames.find((n) => n.toLowerCase().includes(kindId)) ||
    (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null);
  if (!matched) {
    throw new Error(
      `Sheet "${sheetNameFor(kind)}" not found. Available: ${wb.SheetNames.join(", ") || "(none)"}. Upload only the ${sheetNameFor(kind)} sheet.`,
    );
  }
  return XLSX.utils.sheet_to_csv(wb.Sheets[matched], { blankrows: false });
}

async function nextBookingNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.booking.count({
    where: { bookingNumber: { startsWith: `BK-${year}-` } },
  });
  return `BK-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function findProject(companyCode: string, projectCode: string) {
  const company = await prisma.company.findFirst({
    where: { code: companyCode.toUpperCase() },
  });
  if (!company) return { company: null, project: null };
  const project = await prisma.project.findFirst({
    where: { companyId: company.id, code: projectCode.toUpperCase() },
  });
  return { company, project };
}

async function findUnit(companyCode: string, projectCode: string, unitNumber: string) {
  const { project } = await findProject(companyCode, projectCode);
  if (!project) return { project: null, unit: null };
  const unit = await prisma.unit.findFirst({
    where: {
      unitNumber,
      floor: { wing: { projectId: project.id } },
    },
    include: { floor: { include: { wing: true } }, bookings: { where: { status: { not: "cancelled" } } } },
  });
  return { project, unit };
}

function tally(outcomes: RowOutcome[], kind: ImportKind, dryRun: boolean): ImportResult {
  return {
    kind,
    dryRun,
    total: outcomes.length,
    created: outcomes.filter((o) => o.status === "created").length,
    updated: outcomes.filter((o) => o.status === "updated").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "error").length,
    outcomes,
  };
}

export async function runImport(
  kind: ImportKind,
  csvText: string,
  opts: { dryRun: boolean; user: AuthUser },
): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  if (!rows.length) {
    return tally([{ row: 0, status: "error", message: "CSV has no data rows" }], kind, opts.dryRun);
  }
  if (rows.length > 2000) {
    return tally(
      [{ row: 0, status: "error", message: "Maximum 2000 rows per upload" }],
      kind,
      opts.dryRun,
    );
  }

  switch (kind) {
    case "companies":
      return importCompanies(rows, opts);
    case "projects":
      return importProjects(rows, opts);
    case "units":
      return importUnits(rows, opts);
    case "bookings":
      return importBookings(rows, opts);
    case "installments":
      return importInstallments(rows, opts);
    case "payments":
      return importPayments(rows, opts);
    default:
      return tally([{ row: 0, status: "error", message: "Unsupported kind" }], kind, opts.dryRun);
  }
}

async function importCompanies(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const code = cell(row, "company_code", "code").toUpperCase();
    const name = cell(row, "company_name", "name");
    if (!code || !name) {
      outcomes.push({ row: rowNum, status: "error", message: "company_code and company_name required" });
      continue;
    }
    const data = {
      name,
      code,
      address: cell(row, "address") || null,
      city: cell(row, "city") || null,
      state: cell(row, "state") || null,
      gst: cell(row, "gst") || null,
      pan: cell(row, "pan") || null,
      contactPerson: cell(row, "contact_person") || null,
      contactNumber: cell(row, "contact_number") || null,
      email: cell(row, "email") || null,
      status: (cell(row, "status") || "active").toLowerCase() === "inactive" ? "inactive" : "active",
    };
    const existing = await prisma.company.findUnique({ where: { code } });
    if (opts.dryRun) {
      outcomes.push({
        row: rowNum,
        status: existing ? "updated" : "created",
        message: existing ? `Would update ${code}` : `Would create ${code}`,
        key: code,
      });
      continue;
    }
    if (existing) {
      await prisma.company.update({ where: { id: existing.id }, data });
      outcomes.push({ row: rowNum, status: "updated", message: `Updated ${code}`, key: code });
    } else {
      await prisma.company.create({ data });
      outcomes.push({ row: rowNum, status: "created", message: `Created ${code}`, key: code });
    }
  }
  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.companies",
      entityType: "bulk_import",
      entityId: "companies",
      meta: { created: outcomes.filter((o) => o.status === "created").length },
    });
  }
  return tally(outcomes, "companies", opts.dryRun);
}

async function importProjects(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const companyCode = cell(row, "company_code").toUpperCase();
    const projectCode = cell(row, "project_code", "code").toUpperCase();
    const name = cell(row, "project_name", "name");
    if (!companyCode || !projectCode || !name) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: "company_code, project_code and project_name required",
      });
      continue;
    }
    const company = await prisma.company.findUnique({ where: { code: companyCode } });
    if (!company) {
      outcomes.push({ row: rowNum, status: "error", message: `Company ${companyCode} not found`, key: projectCode });
      continue;
    }
    const statusRaw = (cell(row, "status") || "active").toLowerCase();
    const status = ["active", "upcoming", "completed", "inactive"].includes(statusRaw)
      ? statusRaw
      : "active";
    const data = {
      name,
      code: projectCode,
      location: cell(row, "location") || null,
      address: cell(row, "address") || null,
      reraNumber: cell(row, "rera_number") || null,
      reraDate: dateIso(row, "rera_date") ? new Date(dateIso(row, "rera_date")!) : null,
      projectType: cell(row, "project_type") || null,
      status,
      launchDate: dateIso(row, "launch_date") ? new Date(dateIso(row, "launch_date")!) : null,
      expectedCompletion: dateIso(row, "expected_completion")
        ? new Date(dateIso(row, "expected_completion")!)
        : null,
      numberFormat: cell(row, "number_format") || "[Wing]-[Floor][Unit:2]",
    };
    const existing = await prisma.project.findFirst({
      where: { companyId: company.id, code: projectCode },
    });
    const key = `${companyCode}/${projectCode}`;
    if (opts.dryRun) {
      outcomes.push({
        row: rowNum,
        status: existing ? "updated" : "created",
        message: existing ? `Would update ${key}` : `Would create ${key}`,
        key,
      });
      continue;
    }
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data });
      outcomes.push({ row: rowNum, status: "updated", message: `Updated ${key}`, key });
    } else {
      const created = await prisma.project.create({
        data: { ...data, companyId: company.id },
      });
      await grantDefaultAccessOnProjectCreate(created.id, opts.user.id);
      outcomes.push({ row: rowNum, status: "created", message: `Created ${key}`, key });
    }
  }
  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.projects",
      entityType: "bulk_import",
      entityId: "projects",
      meta: { created: outcomes.filter((o) => o.status === "created").length },
    });
  }
  return tally(outcomes, "projects", opts.dryRun);
}

async function importUnits(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const companyCode = cell(row, "company_code").toUpperCase();
    const projectCode = cell(row, "project_code").toUpperCase();
    const wingName = cell(row, "wing_name", "wing");
    const floorRaw = cell(row, "floor_number", "floor");
    const unitNumber = cell(row, "unit_number");
    if (!companyCode || !projectCode || !wingName || floorRaw === "" || !unitNumber) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: "company_code, project_code, wing_name, floor_number, unit_number required",
      });
      continue;
    }
    const floorNumber = Number(floorRaw);
    if (!Number.isInteger(floorNumber) || floorNumber < 0) {
      outcomes.push({ row: rowNum, status: "error", message: "floor_number must be a non-negative integer" });
      continue;
    }
    const { company, project } = await findProject(companyCode, projectCode);
    if (!company || !project) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: `Project ${companyCode}/${projectCode} not found`,
      });
      continue;
    }
    const key = `${projectCode}/${unitNumber}`;
    const existing = await prisma.unit.findFirst({
      where: { unitNumber, floor: { wing: { projectId: project.id } } },
    });
    const unitData = {
      unitType: cell(row, "unit_type") || null,
      configuration: cell(row, "configuration") || null,
      carpetArea: num(row, "carpet_area"),
      builtUpArea: num(row, "built_up_area"),
      saleableArea: num(row, "saleable_area"),
      facing: cell(row, "facing") || null,
      parking: cell(row, "parking") || null,
      basePrice: num(row, "base_price"),
      plc: num(row, "plc"),
      otherCharges: num(row, "other_charges"),
      remarks: cell(row, "remarks") || null,
      status: cell(row, "status") || "available",
    };
    if (opts.dryRun) {
      outcomes.push({
        row: rowNum,
        status: existing ? "updated" : "created",
        message: existing ? `Would update ${key}` : `Would create ${key}`,
        key,
      });
      continue;
    }
    let wing = await prisma.wing.findFirst({ where: { projectId: project.id, name: wingName } });
    if (!wing) {
      const maxSort = await prisma.wing.aggregate({
        where: { projectId: project.id },
        _max: { sortOrder: true },
      });
      wing = await prisma.wing.create({
        data: { projectId: project.id, name: wingName, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
      });
    }
    const floor = await prisma.floor.upsert({
      where: { wingId_number: { wingId: wing.id, number: floorNumber } },
      create: { wingId: wing.id, number: floorNumber },
      update: {},
    });
    if (existing) {
      await prisma.unit.update({
        where: { id: existing.id },
        data: { ...unitData, floorId: floor.id },
      });
      outcomes.push({ row: rowNum, status: "updated", message: `Updated ${key}`, key });
    } else {
      const last = await prisma.unit.aggregate({
        where: { floorId: floor.id },
        _max: { sortOrder: true },
      });
      await prisma.unit.create({
        data: {
          floorId: floor.id,
          unitNumber,
          ...unitData,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { totalUnits: { increment: 1 } },
      });
      outcomes.push({ row: rowNum, status: "created", message: `Created ${key}`, key });
    }
  }
  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.units",
      entityType: "bulk_import",
      entityId: "units",
      meta: { created: outcomes.filter((o) => o.status === "created").length },
    });
  }
  return tally(outcomes, "units", opts.dryRun);
}

async function importBookings(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const companyCode = cell(row, "company_code").toUpperCase();
    const projectCode = cell(row, "project_code").toUpperCase();
    const unitNumber = cell(row, "unit_number");
    const bookingDateIso = dateIso(row, "booking_date");
    const customerName = cell(row, "customer_name");
    const customerMobile = cell(row, "customer_mobile");
    const totalCost = num(row, "total_cost");
    if (!companyCode || !projectCode || !unitNumber || !bookingDateIso || !customerName || !customerMobile || totalCost == null) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: "company_code, project_code, unit_number, booking_date, customer_name, customer_mobile, total_cost required",
      });
      continue;
    }
    const { project, unit } = await findUnit(companyCode, projectCode, unitNumber);
    if (!project || !unit) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: `Unit ${companyCode}/${projectCode}/${unitNumber} not found`,
      });
      continue;
    }
    const wantedNumber = cell(row, "booking_number");
    if (wantedNumber) {
      const exists = await prisma.booking.findUnique({ where: { bookingNumber: wantedNumber } });
      if (exists) {
        outcomes.push({
          row: rowNum,
          status: "skipped",
          message: `Booking ${wantedNumber} already exists`,
          key: wantedNumber,
        });
        continue;
      }
    }
    if (unit.bookings.length) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: `Unit ${unitNumber} already has an active booking`,
        key: unitNumber,
      });
      continue;
    }
    if (!["available", "hold"].includes(unit.status)) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: `Unit ${unitNumber} is ${unit.status}`,
        key: unitNumber,
      });
      continue;
    }

    const statusRaw = (cell(row, "status") || "booked").toLowerCase();
    const status = ["booked", "confirmed", "hold"].includes(statusRaw) ? statusRaw : "booked";
    const finance = num(row, "finance") ?? 0;
    const valueToBeCollected = num(row, "value_to_be_collected") ?? totalCost;
    const financials = {
      agreement: num(row, "agreement") ?? 0,
      gst: num(row, "gst") ?? 0,
      otherCharges: num(row, "other_charges") ?? 0,
      totalCost,
      gstOnAgreement: 0,
      stampDutyRegistration: 0,
      valueToBeCollected,
      finance,
    };

    let partnerId: string | null = null;
    const partnerEmail = cell(row, "channel_partner_email");
    if (partnerEmail) {
      const partner = await prisma.channelPartner.findFirst({
        where: { email: partnerEmail, status: "active" },
      });
      if (!partner) {
        outcomes.push({
          row: rowNum,
          status: "error",
          message: `Channel partner ${partnerEmail} not found`,
        });
        continue;
      }
      partnerId = partner.id;
    }

    if (opts.dryRun) {
      outcomes.push({
        row: rowNum,
        status: "created",
        message: `Would book ${unitNumber} for ${customerName}`,
        key: wantedNumber || unitNumber,
      });
      continue;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const bookingNumber = wantedNumber || (await nextBookingNumber());
        const booking = await tx.booking.create({
          data: {
            bookingNumber,
            bookingDate: new Date(bookingDateIso),
            projectId: project.id,
            unitId: unit.id,
            salesEmployeeId: opts.user.id,
            channelPartnerId: partnerId,
            status,
            remarks: cell(row, "remarks") || null,
            customers: {
              create: [
                {
                  role: "primary",
                  name: customerName,
                  mobile: customerMobile,
                  email: cell(row, "customer_email") || null,
                  pan: cell(row, "customer_pan") || null,
                },
              ],
            },
            financials: { create: financials },
          },
        });
        const unitStatus = status === "hold" ? "hold" : status === "confirmed" ? "sold" : "booked";
        await tx.unit.update({ where: { id: unit.id }, data: { status: unitStatus } });

        if (partnerId) {
          const rule = await tx.commissionRule.findFirst({
            where: { projectId: project.id, active: true },
          });
          if (!rule) throw new Error("No active commission rule for partner booking");
          const snap = computeEntitlement(rule, totalCost);
          await tx.partnerEntitlement.create({
            data: {
              bookingId: booking.id,
              ruleId: rule.id,
              entitlementPercent: snap.percent,
              entitlementAmount: snap.amount,
              received: 0,
              outstanding: snap.amount,
            },
          });
        }

        const full = await tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
          include: { financials: true, customers: true },
        });
        await generateSchedules(tx, full);
        await syncInstallmentReminders(tx, {
          bookingId: booking.id,
          projectId: project.id,
          bookingNumber: full.bookingNumber,
          customerName,
        });
        await issueDocument(tx, {
          bookingId: booking.id,
          kind: "invoice",
          amount: totalCost,
          tax: financials.gst,
          notes: `Agreement invoice for ${full.bookingNumber}`,
        });
        return full;
      });
      outcomes.push({
        row: rowNum,
        status: "created",
        message: `Created ${result.bookingNumber}`,
        key: result.bookingNumber,
      });
    } catch (err) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: err instanceof Error ? err.message : "Booking failed",
      });
    }
  }
  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.bookings",
      entityType: "bulk_import",
      entityId: "bookings",
      meta: { created: outcomes.filter((o) => o.status === "created").length },
    });
  }
  return tally(outcomes, "bookings", opts.dryRun);
}

async function importInstallments(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  const byBooking = new Map<string, { rowNums: number[]; items: { name: string; afterDays: number; amount: number; dueDate: string | null; sort: number }[] }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const bookingNumber = cell(row, "booking_number");
    const name = cell(row, "name", "installment_name");
    const amount = num(row, "amount");
    if (!bookingNumber || !name || amount == null || amount <= 0) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: "booking_number, name and positive amount required",
      });
      continue;
    }
    const afterDays = Math.max(0, Math.round(num(row, "after_days") ?? 0));
    const sort = Math.round(num(row, "sort_order") ?? i + 1);
    const due = dateIso(row, "due_date");
    const group = byBooking.get(bookingNumber) ?? { rowNums: [], items: [] };
    group.rowNums.push(rowNum);
    group.items.push({ name, afterDays, amount, dueDate: due, sort });
    byBooking.set(bookingNumber, group);
  }

  for (const [bookingNumber, group] of byBooking) {
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber },
      include: { financials: true, customers: true, schedules: true },
    });
    if (!booking) {
      for (const r of group.rowNums) {
        outcomes.push({ row: r, status: "error", message: `Booking ${bookingNumber} not found`, key: bookingNumber });
      }
      continue;
    }
    const received = booking.schedules.some((s) => s.received > 0);
    if (received) {
      for (const r of group.rowNums) {
        outcomes.push({
          row: r,
          status: "error",
          message: `${bookingNumber} already has received installment amounts — cannot replace`,
          key: bookingNumber,
        });
      }
      continue;
    }
    const items = [...group.items].sort((a, b) => a.sort - b.sort);
    if (opts.dryRun) {
      for (const r of group.rowNums) {
        outcomes.push({
          row: r,
          status: "updated",
          message: `Would set ${items.length} installment(s) on ${bookingNumber}`,
          key: bookingNumber,
        });
      }
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.paymentSchedule.deleteMany({ where: { bookingId: booking.id } });
        const hasCustomDue = items.some((it) => it.dueDate);
        if (hasCustomDue) {
          await tx.paymentSchedule.createMany({
            data: items.map((it, idx) => {
              const dueDate = it.dueDate
                ? new Date(it.dueDate)
                : addDays(booking.bookingDate, it.afterDays);
              return {
                bookingId: booking.id,
                name: it.name,
                afterDays: it.afterDays,
                dueDate,
                amount: round2(it.amount),
                received: 0,
                outstanding: round2(it.amount),
                status: "pending",
                sortOrder: idx + 1,
              };
            }),
          });
        } else {
          await createInstallmentSchedules(tx, booking, items);
        }
        await syncInstallmentReminders(tx, {
          bookingId: booking.id,
          projectId: booking.projectId,
          bookingNumber: booking.bookingNumber,
          customerName: booking.customers.find((c) => c.role === "primary")?.name,
        });
        await recomputeCustomerCollection(tx, booking.id);
      });
      for (const r of group.rowNums) {
        outcomes.push({
          row: r,
          status: "updated",
          message: `Set schedule on ${bookingNumber}`,
          key: bookingNumber,
        });
      }
    } catch (err) {
      for (const r of group.rowNums) {
        outcomes.push({
          row: r,
          status: "error",
          message: err instanceof Error ? err.message : "Installment import failed",
          key: bookingNumber,
        });
      }
    }
  }

  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.installments",
      entityType: "bulk_import",
      entityId: "installments",
      meta: { bookings: byBooking.size },
    });
  }
  return tally(outcomes, "installments", opts.dryRun);
}

async function importPayments(
  rows: Record<string, string>[],
  opts: { dryRun: boolean; user: AuthUser },
) {
  const outcomes: RowOutcome[] = [];
  const modes = new Set(["cash", "cheque", "neft", "rtgs", "upi"]);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const bookingNumber = cell(row, "booking_number");
    const paymentDate = dateIso(row, "payment_date");
    const amount = num(row, "amount");
    const mode = cell(row, "payment_mode").toLowerCase();
    if (!bookingNumber || !paymentDate || amount == null || amount <= 0 || !modes.has(mode)) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: "booking_number, payment_date, amount, payment_mode (cash|cheque|neft|rtgs|upi) required",
      });
      continue;
    }
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber },
      include: { financials: true },
    });
    if (!booking) {
      outcomes.push({ row: rowNum, status: "error", message: `Booking ${bookingNumber} not found` });
      continue;
    }
    const appliesTo = (cell(row, "applies_to") || "customer").toLowerCase() === "partner" ? "partner" : "customer";
    const statusRaw = (cell(row, "status") || "received").toLowerCase();
    const status = ["pending", "received", "verified", "reconciled"].includes(statusRaw)
      ? statusRaw
      : "received";

    const dup = await prisma.payment.findFirst({
      where: {
        bookingId: booking.id,
        amount,
        paymentMode: mode,
        paymentDate: new Date(paymentDate),
        appliesTo,
      },
    });
    if (dup) {
      outcomes.push({
        row: rowNum,
        status: "skipped",
        message: `Duplicate payment on ${bookingNumber}`,
        key: bookingNumber,
      });
      continue;
    }

    if (opts.dryRun) {
      outcomes.push({
        row: rowNum,
        status: "created",
        message: `Would record ₹${amount} on ${bookingNumber}`,
        key: bookingNumber,
      });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            bookingId: booking.id,
            paymentDate: new Date(paymentDate),
            amount,
            paymentMode: mode,
            utrOrCheque: cell(row, "utr_or_cheque") || null,
            bank: cell(row, "bank") || null,
            remarks: cell(row, "remarks") || null,
            appliesTo,
            status,
            addedBy: opts.user.id,
          },
        });
        if (appliesTo === "partner") {
          await recomputePartnerEntitlement(tx, booking.id);
        } else {
          await recomputeCustomerCollection(tx, booking.id);
          if (status !== "pending") {
            await issueDocument(tx, {
              bookingId: booking.id,
              kind: "receipt",
              amount,
              paymentId: created.id,
              notes: `${mode.toUpperCase()} ${cell(row, "utr_or_cheque")}`.trim(),
            });
          }
        }
      });
      outcomes.push({
        row: rowNum,
        status: "created",
        message: `Recorded ₹${amount} on ${bookingNumber}`,
        key: bookingNumber,
      });
    } catch (err) {
      outcomes.push({
        row: rowNum,
        status: "error",
        message: err instanceof Error ? err.message : "Payment failed",
        key: bookingNumber,
      });
    }
  }

  if (!opts.dryRun) {
    await audit({
      actorId: opts.user.id,
      actorName: opts.user.name,
      action: "bulk.import.payments",
      entityType: "bulk_import",
      entityId: "payments",
      meta: { created: outcomes.filter((o) => o.status === "created").length },
    });
  }
  return tally(outcomes, "payments", opts.dryRun);
}
