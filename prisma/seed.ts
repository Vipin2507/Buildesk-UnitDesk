import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { formatUnitNumber } from "../server/lib/units.ts";
import { computeEntitlement, round2 } from "../server/lib/commission.ts";
import { recomputeCustomerCollection } from "../server/lib/schedule.ts";
import { ALL_ACTIONS } from "../server/lib/permissions.ts";

const prisma = new PrismaClient();
const DOMAIN = "cravingcode.in";
const PAYMENT_MODES = ["neft", "rtgs", "upi", "cash", "cheque"] as const;
const PAYMENT_STATUSES = ["received", "verified", "reconciled", "pending"] as const;

function daysFromNow(offset: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function monthsAgo(months: number, day = 12) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() - months);
  d.setDate(Math.min(day, 28));
  return d;
}

const ACTIONS = [...ALL_ACTIONS];

const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Yes Bank",
  "IDFC First Bank",
];
const LOCALITIES = [
  "Baner",
  "Aundh",
  "Kothrud",
  "Hinjawadi",
  "Kalyani Nagar",
  "Wakad",
  "Viman Nagar",
  "Hadapsar",
  "Andheri East",
  "Powai",
  "Thane West",
  "Bandra Kurla",
];

const BUYER_NAMES = [
  "Priya Kulkarni",
  "Amit Joshi",
  "Farhan Qureshi",
  "Meera Iyer",
  "Rohit Patil",
  "Sneha Kadam",
  "Arjun Nair",
  "Kavita Rao",
  "Nikhil Deshmukh",
  "Ananya Shah",
  "Vikram Singh",
  "Pooja Menon",
  "Siddharth Bose",
  "Rhea Kapoor",
  "Aditya Kulkarni",
  "Neha Verma",
  "Manish Tiwari",
  "Shreya Banerjee",
  "Kunal Mehta",
  "Isha Agarwal",
  "Devansh Pillai",
  "Tanvi Saxena",
  "Harshwardhan More",
  "Sonal Chavan",
  "Yash Thakur",
  "Pallavi Joshi",
  "Rohan Malhotra",
  "Divya Nambiar",
  "Akash Shetty",
  "Mitali Ghosh",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function statusFor(unitNumber: string, soldBias = 0, forceStock = false) {
  if (forceStock) {
    const r = hash(unitNumber) % 100;
    if (r < 8) return "not_available";
    if (r < 12) return "blocked";
    return "available";
  }
  const r = (hash(unitNumber) + soldBias) % 100;
  if (r < 10) return "sold";
  if (r < 24) return "booked";
  if (r < 30) return "hold";
  if (r < 33) return "blocked";
  if (r < 36) return "not_available";
  return "available";
}

function listPriceFor(
  unitTypeIndex: number,
  floorNo: number,
  wingIndex: number,
  base1 = 48_00_000,
  base2 = 72_00_000,
  base3 = 98_00_000,
) {
  const base = unitTypeIndex === 1 ? base1 : unitTypeIndex <= 5 ? base2 : base3;
  return round2(base + floorNo * 35_000 + wingIndex * 75_000);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z]+/g, ".");
}

type SeedUnit = {
  id: string;
  number: string;
  status: string;
  listPrice: number;
  unitType: string;
};

type ProjectSpec = {
  companyId: string;
  name: string;
  code: string;
  location: string;
  address: string;
  reraNumber: string;
  projectType: "Residential" | "Commercial";
  wings: string[];
  floors: number;
  unitsPerFloor: number;
  status: string;
  launchDate: Date;
  expectedCompletion: Date;
  numberFormat: string;
  priceBase?: [number, number, number];
  soldBias?: number;
  bookingPrefix: string;
  forceStock?: boolean;
};

async function seedInventory(
  projectId: string,
  spec: ProjectSpec,
): Promise<SeedUnit[]> {
  const units: SeedUnit[] = [];
  const [b1, b2, b3] = spec.priceBase ?? [48_00_000, 72_00_000, 98_00_000];
  for (const [wi, name] of spec.wings.entries()) {
    const wing = await prisma.wing.create({
      data: { projectId, name, sortOrder: wi },
    });
    for (let floorNo = 1; floorNo <= spec.floors; floorNo++) {
      const floor = await prisma.floor.create({
        data: { wingId: wing.id, number: floorNo },
      });
      for (let u = 1; u <= spec.unitsPerFloor; u++) {
        const unitNumber = formatUnitNumber(spec.numberFormat, name, floorNo, u);
        const st = statusFor(unitNumber, spec.soldBias ?? 0, Boolean(spec.forceStock));
        const isCommercial = spec.projectType === "Commercial";
        const unitType = isCommercial
          ? u <= 2
            ? "Office"
            : u <= 4
              ? "Shop"
              : "Showroom"
          : u === 1
            ? "1BHK"
            : u <= Math.ceil(spec.unitsPerFloor * 0.6)
              ? "2BHK"
              : "3BHK";
        const basePrice = isCommercial
          ? round2(55_00_000 + wi * 1_00_000 + floorNo * 40_000 + u * 25_000)
          : listPriceFor(u, floorNo, wi, b1, b2, b3);
        const plc = 1_50_000 + (floorNo > Math.floor(spec.floors * 0.66) ? 50_000 : 0);
        const otherCharges = isCommercial ? 1_20_000 : 85_000;
        const created = await prisma.unit.create({
          data: {
            floorId: floor.id,
            unitNumber,
            unitType,
            configuration: isCommercial ? `${unitType} bay` : unitType.replace("BHK", " BHK"),
            carpetArea: isCommercial ? 400 + u * 80 : u === 1 ? 520 : u <= 5 ? 780 : 1120,
            builtUpArea: isCommercial ? 480 + u * 90 : u === 1 ? 640 : u <= 5 ? 920 : 1320,
            saleableArea: isCommercial ? 520 + u * 100 : u === 1 ? 720 : u <= 5 ? 1050 : 1480,
            balconyArea: isCommercial ? 0 : 65,
            facing: ["East", "West", "North", "South"][(u - 1) % 4],
            parking: u === 1 ? "1 open" : "1 covered",
            basePrice,
            plc,
            otherCharges,
            sortOrder: u,
            status: st,
          },
        });
        units.push({
          id: created.id,
          number: unitNumber,
          status: st,
          listPrice: round2(basePrice + plc + otherCharges),
          unitType,
        });
      }
    }
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { totalUnits: units.length },
  });
  return units;
}

/** Patterns cover 0%, ~20% booking, ~25–40%, ~50%, ~75%, ~100% collection bands + all modes/statuses. */
function buildCustomerPayments(
  i: number,
  collect: number,
  buyer: string,
): {
  amount: number;
  paymentDate: Date;
  paymentMode: (typeof PAYMENT_MODES)[number];
  status: (typeof PAYMENT_STATUSES)[number];
  utrOrCheque: string;
  remarks?: string;
}[] {
  const bookingAmt = round2(collect * 0.2);
  const slab = round2(collect * 0.15);
  const mode = PAYMENT_MODES[i % PAYMENT_MODES.length];
  const pattern = i % 10;
  const out: ReturnType<typeof buildCustomerPayments> = [];

  if (pattern === 0) {
    // ~50–55%
    out.push(
      {
        amount: bookingAmt,
        paymentDate: monthsAgo(4, 5),
        paymentMode: "neft",
        status: "reconciled",
        utrOrCheque: `NEFT${100100 + i}`,
        remarks: "Booking amount",
      },
      {
        amount: slab,
        paymentDate: monthsAgo(2, 18),
        paymentMode: "rtgs",
        status: "verified",
        utrOrCheque: `RTGS${200200 + i}`,
        remarks: "Slab 1",
      },
      {
        amount: round2(Math.min(slab * 1.2, Math.max(0, collect - bookingAmt - slab))),
        paymentDate: daysFromNow(-(i % 5)),
        paymentMode: "upi",
        status: "received",
        utrOrCheque: `${slug(buyer)}@okhdfcbank`,
        remarks: "This month collection",
      },
    );
  } else if (pattern === 1) {
    // ~20% booking only
    out.push({
      amount: bookingAmt,
      paymentDate: monthsAgo(2, 10 + (i % 8)),
      paymentMode: mode,
      status: "received",
      utrOrCheque: mode === "cheque" ? `CHQ${1100 + i}` : `UPI${300300 + i}`,
      remarks: "Booking token",
    });
  } else if (pattern === 2) {
    // ~20% verified + pending slab
    out.push(
      {
        amount: bookingAmt,
        paymentDate: monthsAgo(1, 6),
        paymentMode: "neft",
        status: "verified",
        utrOrCheque: `HDFCN${310000 + i}`,
        remarks: "Booking amount verified",
      },
      {
        amount: slab,
        paymentDate: daysFromNow(-1),
        paymentMode: "cheque",
        status: "pending",
        utrOrCheque: `CHQ${2200 + i}`,
        remarks: "Cheque deposited — clearing",
      },
    );
  } else if (pattern === 3) {
    // 0% cleared (optional pending)
    if (i % 2 === 0) {
      out.push({
        amount: Math.min(100000, bookingAmt),
        paymentDate: daysFromNow(0),
        paymentMode: "upi",
        status: "pending",
        utrOrCheque: `${slug(buyer)}@paytm`,
        remarks: "Promised — not cleared",
      });
    }
  } else if (pattern === 4) {
    // ~35% MTD heavy
    out.push(
      {
        amount: bookingAmt,
        paymentDate: daysFromNow(-(8 + (i % 6))),
        paymentMode: "neft",
        status: "received",
        utrOrCheque: `NEFT${400400 + i}`,
        remarks: "MTD booking amount",
      },
      {
        amount: slab,
        paymentDate: daysFromNow(-(i % 4)),
        paymentMode: "upi",
        status: "verified",
        utrOrCheque: `${slug(buyer)}@oksbi`,
        remarks: "MTD slab",
      },
    );
  } else if (pattern === 5) {
    // ~100% fully paid
    const a1 = bookingAmt;
    const a2 = round2(collect * 0.3);
    const a3 = round2(Math.max(0, collect - a1 - a2));
    out.push(
      {
        amount: a1,
        paymentDate: monthsAgo(5, 3),
        paymentMode: "neft",
        status: "reconciled",
        utrOrCheque: `NEFT${500500 + i}`,
      },
      {
        amount: a2,
        paymentDate: monthsAgo(3, 14),
        paymentMode: "rtgs",
        status: "reconciled",
        utrOrCheque: `RTGS${500600 + i}`,
      },
      {
        amount: a3,
        paymentDate: monthsAgo(1, 20),
        paymentMode: "neft",
        status: "verified",
        utrOrCheque: `NEFT${500700 + i}`,
        remarks: "Final towards value to collect",
      },
    );
  } else if (pattern === 6) {
    // ~75%
    out.push(
      {
        amount: bookingAmt,
        paymentDate: monthsAgo(6, 4),
        paymentMode: "neft",
        status: "reconciled",
        utrOrCheque: `NEFT${600600 + i}`,
      },
      {
        amount: round2(collect * 0.3),
        paymentDate: monthsAgo(3, 12),
        paymentMode: "rtgs",
        status: "verified",
        utrOrCheque: `RTGS${600700 + i}`,
      },
      {
        amount: round2(collect * 0.25),
        paymentDate: monthsAgo(1, 8),
        paymentMode: "upi",
        status: "received",
        utrOrCheque: `${slug(buyer)}@axl`,
        remarks: "~75% collected",
      },
    );
  } else if (pattern === 7) {
    // ~25%
    out.push({
      amount: round2(collect * 0.25),
      paymentDate: monthsAgo(1, 15),
      paymentMode: "cash",
      status: "received",
      utrOrCheque: `CASH-${3000 + i}`,
      remarks: "Cash at site — 25%",
    });
  } else if (pattern === 8) {
    // ~50% exactly-ish
    out.push(
      {
        amount: bookingAmt,
        paymentDate: monthsAgo(3, 9),
        paymentMode: "neft",
        status: "reconciled",
        utrOrCheque: `NEFT${800800 + i}`,
      },
      {
        amount: round2(collect * 0.3),
        paymentDate: daysFromNow(-3),
        paymentMode: "cheque",
        status: "verified",
        utrOrCheque: `CHQ${8000 + i}`,
        remarks: "~50% milestone",
      },
    );
  } else {
    // mid ~30% mix
    out.push({
      amount: round2(bookingAmt + slab * 0.5),
      paymentDate: monthsAgo(1, 22),
      paymentMode: i % 2 ? "cash" : "upi",
      status: "received",
      utrOrCheque: i % 2 ? `CASH-${1000 + i}` : `${slug(buyer)}@ybl`,
      remarks: i % 2 ? "Cash at site office" : "UPI receipt",
    });
  }
  return out;
}

async function seedBookingsForProject(opts: {
  projectId: string;
  units: SeedUnit[];
  bookingPrefix: string;
  startSeq: number;
  partners: { id: string }[];
  ruleId: string;
  adminId: string;
  salesId: string;
  cityHint: string;
}): Promise<{ bookedIds: string[]; nextSeq: number }> {
  const bookable = opts.units.filter((u) => u.status === "sold" || u.status === "booked");
  let seq = opts.startSeq;
  const bookedIds: string[] = [];

  for (const [i, unit] of bookable.entries()) {
    const agreement = round2(unit.listPrice * (0.9 + (hash(unit.number) % 16) / 100));
    const gst = Math.round(agreement * 0.05);
    const otherCharges = 85000;
    const gstOnAgreement = Math.round(agreement * 0.01);
    const stampDutyRegistration = Math.round(agreement * 0.05) + 45000;
    const totalCost = round2(agreement + gst + otherCharges + gstOnAgreement + stampDutyRegistration);
    const financeShare = [0.7, 0.75, 0.8, 0.85, 0, 0.6][i % 6];
    const finance = round2(totalCost * financeShare);
    const valueToBeCollected = round2(Math.max(0, totalCost - finance));
    const partner =
      i % 4 === 0
        ? opts.partners[0]
        : i % 4 === 1
          ? opts.partners[1 % opts.partners.length]
          : i % 4 === 2 && opts.partners[2]
            ? opts.partners[2]
            : null;
    const rule = await prisma.commissionRule.findUnique({ where: { id: opts.ruleId } });
    const snap = partner && rule ? computeEntitlement(rule, totalCost) : null;
    const date = monthsAgo(1 + (i % 10), (i % 25) + 1);
    const buyer = BUYER_NAMES[(i + hash(opts.projectId)) % BUYER_NAMES.length];
    const mail = `${slug(buyer)}.${opts.bookingPrefix.toLowerCase()}${i}@${DOMAIN}`;
    const bookingStatus =
      unit.status === "sold" ? (i % 5 === 0 ? "hold" : "confirmed") : i % 11 === 0 ? "hold" : "booked";

    const booking = await prisma.booking.create({
      data: {
        bookingNumber: `${opts.bookingPrefix}-${String(seq++).padStart(4, "0")}`,
        bookingDate: date,
        projectId: opts.projectId,
        unitId: unit.id,
        salesEmployeeId: opts.salesId,
        channelPartnerId: partner?.id,
        status: bookingStatus === "hold" && unit.status === "sold" ? "confirmed" : bookingStatus,
        remarks: i % 9 === 0 ? "Site visit completed · docs pending" : null,
        customers: {
          create: [
            {
              role: "primary",
              name: buyer,
              mobile: `98${String(20000000 + hash(unit.number) % 80000000).slice(0, 8)}`,
              email: mail,
              pan: `ABCDE${String(1000 + (hash(unit.number) % 9000)).padStart(4, "0")}F`,
              address: `${LOCALITIES[i % LOCALITIES.length]}, ${opts.cityHint}`,
            },
            ...(i % 5 === 0
              ? [
                  {
                    role: "co_applicant" as const,
                    name: BUYER_NAMES[(i + 7) % BUYER_NAMES.length],
                    mobile: `97${String(30000000 + i).slice(0, 8)}`,
                    email: `co.${slug(buyer)}${i}@${DOMAIN}`,
                    pan: `FGHIJ${String(2000 + i).padStart(4, "0")}K`,
                    address: `${LOCALITIES[(i + 3) % LOCALITIES.length]}, ${opts.cityHint}`,
                  },
                ]
              : []),
          ],
        },
        financials: {
          create: {
            agreement,
            gst,
            otherCharges,
            totalCost,
            gstOnAgreement,
            stampDutyRegistration,
            valueToBeCollected,
            finance,
          },
        },
      },
    });
    bookedIds.push(booking.id);

    // Align unit status with booking when hold was forced
    if (booking.status === "hold") {
      await prisma.unit.update({ where: { id: unit.id }, data: { status: "hold" } });
    }

    if (partner && snap && rule) {
      const received = i % 2 === 0 ? round2(snap.amount * 0.4) : 0;
      await prisma.partnerEntitlement.create({
        data: {
          bookingId: booking.id,
          ruleId: rule.id,
          entitlementPercent: snap.percent,
          entitlementAmount: snap.amount,
          received,
          outstanding: round2(snap.amount - received),
        },
      });
      if (received) {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            paymentDate: monthsAgo(1, 8 + (i % 10)),
            amount: received,
            paymentMode: "neft",
            utrOrCheque: `HDFCN${900000 + i + hash(opts.projectId) % 1000}`,
            bank: BANKS[i % BANKS.length],
            appliesTo: "partner",
            status: "verified",
            remarks: "Partner commission payout",
            addedBy: opts.adminId,
          },
        });
      } else if (i % 5 === 0) {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            paymentDate: daysFromNow(-2),
            amount: round2(snap.amount * 0.25),
            paymentMode: "rtgs",
            utrOrCheque: `AXRTG${700000 + i}`,
            bank: BANKS[(i + 1) % BANKS.length],
            appliesTo: "partner",
            status: "pending",
            remarks: "Awaiting finance verification",
            addedBy: opts.salesId,
          },
        });
      }
    }

    const collect = valueToBeCollected;
    const bank = BANKS[i % BANKS.length];
    const customerPayments = buildCustomerPayments(i, collect, buyer);
    let running = 0;
    for (const [pi, p] of customerPayments.entries()) {
      let amount = round2(p.amount);
      if (p.status !== "pending") {
        const room = round2(Math.max(0, collect - running));
        amount = round2(Math.min(amount, room));
        if (amount <= 0) continue;
        running = round2(running + amount);
      } else if (amount <= 0) {
        continue;
      }
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          paymentDate: p.paymentDate,
          amount,
          paymentMode: p.paymentMode,
          utrOrCheque: p.utrOrCheque,
          bank,
          appliesTo: "customer",
          status: p.status,
          remarks: p.remarks ?? null,
          addedBy: pi % 2 ? opts.adminId : opts.salesId,
          verifiedBy: p.status === "verified" || p.status === "reconciled" ? opts.adminId : null,
        },
      });
    }
  }

  return { bookedIds, nextSeq: seq };
}

async function main() {
  await prisma.messageLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.paymentSchedule.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.partnerEntitlement.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.bookingFinancial.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.projectAccess.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.wing.deleteMany();
  await prisma.commissionRule.deleteMany();
  await prisma.project.deleteMany();
  await prisma.company.deleteMany();
  await prisma.channelPartner.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();

  const superAdmin = await prisma.role.create({
    data: {
      name: "Super Admin",
      isSystem: true,
      permissions: { create: ACTIONS.map((action) => ({ action })) },
    },
  });
  const sales = await prisma.role.create({
    data: {
      name: "Sales Manager",
      permissions: {
        create: ["view", "add", "edit", "book", "hold", "payment_view", "payment_entry", "reports"].map(
          (action) => ({ action }),
        ),
      },
    },
  });

  const admin = await prisma.employee.create({
    data: {
      name: "Vipin Sharma",
      email: `vipin@${DOMAIN}`,
      phone: "9876500001",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      roleId: superAdmin.id,
    },
  });
  const salesUser = await prisma.employee.create({
    data: {
      name: "Rahul Deshpande",
      email: `rahul@${DOMAIN}`,
      phone: "9876500002",
      passwordHash: await bcrypt.hash("Sales@123", 10),
      roleId: sales.id,
    },
  });
  const salesMumbai = await prisma.employee.create({
    data: {
      name: "Sneha Kulkarni",
      email: `sneha@${DOMAIN}`,
      phone: "9876500003",
      passwordHash: await bcrypt.hash("Sales@123", 10),
      roleId: sales.id,
    },
  });

  const abc = await prisma.company.create({
    data: {
      name: "ABC Developers",
      code: "ABC",
      city: "Pune",
      state: "Maharashtra",
      address: "Kalyani Nagar, Pune 411006",
      gst: "27AABCU9603R1ZM",
      pan: "AABCU9603R",
      contactPerson: "Vipin Sharma",
      contactNumber: "020-66112200",
      email: `hello@${DOMAIN}`,
      status: "active",
    },
  });
  const horizon = await prisma.company.create({
    data: {
      name: "Horizon Realty",
      code: "HRZ",
      city: "Mumbai",
      state: "Maharashtra",
      address: "Andheri East, Mumbai 400069",
      gst: "27AABCH1234R1Z5",
      pan: "AABCH1234R",
      contactPerson: "Neha Kapoor",
      contactNumber: "022-40011200",
      email: `neha@${DOMAIN}`,
      status: "active",
    },
  });
  const emerald = await prisma.company.create({
    data: {
      name: "Emerald Homes Pvt Ltd",
      code: "EMR",
      city: "Pune",
      state: "Maharashtra",
      address: "Wakad, Pune 411057",
      gst: "27AABCE7788Q1Z2",
      pan: "AABCE7788Q",
      contactPerson: "Rajesh Emerald",
      contactNumber: "020-67221000",
      email: `contact@${DOMAIN}`,
      status: "active",
    },
  });
  const skyline = await prisma.company.create({
    data: {
      name: "Skyline Infra",
      code: "SKY",
      city: "Thane",
      state: "Maharashtra",
      address: "Ghodbunder Road, Thane 400615",
      gst: "27AABCS9900P1Z8",
      pan: "AABCS9900P",
      contactPerson: "Amit Skyline",
      contactNumber: "022-25881200",
      email: `skyline@${DOMAIN}`,
      status: "active",
    },
  });

  const partnerHash = await bcrypt.hash("Partner@123", 10);
  const partners = await Promise.all([
    prisma.channelPartner.create({
      data: {
        name: "Sanjay Realty",
        phone: "9822011111",
        email: `sanjay@${DOMAIN}`,
        panGst: "AAMFS1234P",
        firmName: "Sanjay Realty LLP",
        passwordHash: partnerHash,
      },
    }),
    prisma.channelPartner.create({
      data: {
        name: "Urban Nest Brokers",
        phone: "9822022222",
        email: `neha.brokers@${DOMAIN}`,
        panGst: "AADFU7788Q",
        firmName: "Urban Nest Brokers",
        passwordHash: partnerHash,
      },
    }),
    prisma.channelPartner.create({
      data: {
        name: "Metro Homes CP",
        phone: "9822033333",
        email: `metro@${DOMAIN}`,
        panGst: "AADFM5566R",
        firmName: "Metro Homes Channel",
        passwordHash: partnerHash,
      },
    }),
    prisma.channelPartner.create({
      data: {
        name: "Prime Connect Brokers",
        phone: "9822044444",
        email: `prime@${DOMAIN}`,
        panGst: "AADFP3344S",
        firmName: "Prime Connect",
        passwordHash: partnerHash,
      },
    }),
  ]);

  const projectSpecs: ProjectSpec[] = [
    {
      companyId: abc.id,
      name: "The Grand Residences",
      code: "TGR",
      location: "Baner, Pune",
      address: "Survey 42, Baner Road, Pune 411045",
      reraNumber: "P52100012345",
      projectType: "Residential",
      wings: ["A", "B", "C"],
      floors: 12,
      unitsPerFloor: 8,
      status: "active",
      launchDate: new Date("2024-06-01"),
      expectedCompletion: new Date("2027-12-31"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      bookingPrefix: "BK-TGR",
      soldBias: 0,
    },
    {
      companyId: abc.id,
      name: "ABC Business Plaza",
      code: "ABP",
      location: "Hinjawadi, Pune",
      address: "Phase 1, Hinjawadi, Pune 411057",
      reraNumber: "P52100019876",
      projectType: "Commercial",
      wings: ["T1"],
      floors: 8,
      unitsPerFloor: 6,
      status: "active",
      launchDate: new Date("2025-01-15"),
      expectedCompletion: new Date("2028-06-30"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      bookingPrefix: "BK-ABP",
      soldBias: 5,
    },
    {
      companyId: horizon.id,
      name: "Horizon Towers",
      code: "HRT",
      location: "Powai, Mumbai",
      address: "Hiranandani Gardens, Powai 400076",
      reraNumber: "P51800055443",
      projectType: "Residential",
      wings: ["N", "S"],
      floors: 10,
      unitsPerFloor: 6,
      status: "active",
      launchDate: new Date("2023-11-01"),
      expectedCompletion: new Date("2026-09-30"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      priceBase: [85_00_000, 1_25_00_000, 1_80_00_000],
      bookingPrefix: "BK-HRT",
      soldBias: 8,
    },
    {
      companyId: emerald.id,
      name: "Emerald Greens",
      code: "EMG",
      location: "Wakad, Pune",
      address: "Near Dange Chowk, Wakad 411057",
      reraNumber: "P52100033441",
      projectType: "Residential",
      wings: ["A", "B"],
      floors: 8,
      unitsPerFloor: 6,
      status: "active",
      launchDate: new Date("2024-09-01"),
      expectedCompletion: new Date("2027-03-31"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      priceBase: [42_00_000, 65_00_000, 88_00_000],
      bookingPrefix: "BK-EMG",
      soldBias: 3,
    },
    {
      companyId: skyline.id,
      name: "Skyline Crest",
      code: "SKC",
      location: "Thane West",
      address: "Ghodbunder Road, Thane 400615",
      reraNumber: "P51700088990",
      projectType: "Residential",
      wings: ["A", "B", "C"],
      floors: 9,
      unitsPerFloor: 4,
      status: "active",
      launchDate: new Date("2025-02-01"),
      expectedCompletion: new Date("2028-12-31"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      priceBase: [55_00_000, 78_00_000, 1_05_00_000],
      bookingPrefix: "BK-SKC",
      soldBias: 12,
    },
    {
      companyId: horizon.id,
      name: "Horizon Lakeview (Upcoming)",
      code: "HRL",
      location: "BKC, Mumbai",
      address: "Bandra Kurla Complex, Mumbai",
      reraNumber: "P51800000001",
      projectType: "Residential",
      wings: ["A"],
      floors: 4,
      unitsPerFloor: 4,
      status: "upcoming",
      launchDate: new Date("2026-06-01"),
      expectedCompletion: new Date("2030-12-31"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
      bookingPrefix: "BK-HRL",
      forceStock: true,
    },
  ];

  const allBookedIds: string[] = [];
  let unitTotal = 0;
  const projectIds: string[] = [];

  for (const spec of projectSpecs) {
    const agreedBrokerage = spec.projectType === "Commercial" ? 2 : 4;
    const milestones =
      spec.projectType === "Commercial"
        ? [
            { collectionPct: 10, brokeragePct: 1, sortOrder: 0 },
            { collectionPct: 40, brokeragePct: 1, sortOrder: 1 },
          ]
        : [
            { collectionPct: 5, brokeragePct: 1, sortOrder: 0 },
            { collectionPct: 20, brokeragePct: 2, sortOrder: 1 },
            { collectionPct: 30, brokeragePct: 1, sortOrder: 2 },
          ];

    const project = await prisma.project.create({
      data: {
        companyId: spec.companyId,
        name: spec.name,
        code: spec.code,
        location: spec.location,
        address: spec.address,
        reraNumber: spec.reraNumber,
        reraDate: new Date("2024-03-12"),
        projectType: spec.projectType,
        totalWings: spec.wings.length,
        totalFloors: spec.floors,
        unitsPerFloor: spec.unitsPerFloor,
        totalUnits: 0,
        status: spec.status,
        launchDate: spec.launchDate,
        expectedCompletion: spec.expectedCompletion,
        numberFormat: spec.numberFormat,
        mandateTerm: "Till project completion",
        agreedMandateBrokerage: agreedBrokerage,
        totalBrokeragePct: agreedBrokerage,
        mandateBrokeragePaymentTerm: "As per collection milestones",
        brokerageMilestones: { create: milestones },
      },
    });
    projectIds.push(project.id);

    const rule = await prisma.commissionRule.create({
      data: {
        projectId: project.id,
        name: "Mandate brokerage",
        type: "percentage",
        value: agreedBrokerage,
        active: true,
      },
    });

    const salesForProject =
      spec.companyId === horizon.id || spec.companyId === skyline.id ? salesMumbai.id : salesUser.id;

    await prisma.projectAccess.createMany({
      data: [
        { employeeId: admin.id, projectId: project.id },
        { employeeId: salesUser.id, projectId: project.id },
        { employeeId: salesMumbai.id, projectId: project.id },
      ],
    });

    // Upcoming: inventory only, lightly bookable
    const units = await seedInventory(project.id, spec);
    unitTotal += units.length;

    if (spec.status === "upcoming") continue;

    const cityHint =
      spec.companyId === horizon.id || spec.companyId === skyline.id ? "Mumbai" : "Pune";
    const { bookedIds } = await seedBookingsForProject({
      projectId: project.id,
      units,
      bookingPrefix: spec.bookingPrefix,
      startSeq: 1,
      partners,
      ruleId: rule.id,
      adminId: admin.id,
      salesId: salesForProject,
      cityHint,
    });
    allBookedIds.push(...bookedIds);
  }

  for (const bookingId of allBookedIds) {
    await recomputeCustomerCollection(prisma, bookingId);
  }

  await prisma.appSetting.upsert({
    where: { key: "orgName" },
    update: { value: "Craving Code" },
    create: { key: "orgName", value: "Craving Code" },
  });
  await prisma.appSetting.upsert({
    where: { key: "orgEmail" },
    update: { value: `hello@${DOMAIN}` },
    create: { key: "orgEmail", value: `hello@${DOMAIN}` },
  });

  const paymentCount = await prisma.payment.count();
  const scheduleCount = await prisma.paymentSchedule.count();
  const companyCount = await prisma.company.count();
  const projectCount = await prisma.project.count();
  const soldBooked = await prisma.unit.count({ where: { status: { in: ["sold", "booked", "hold"] } } });
  const orphan = await prisma.unit.count({
    where: {
      status: { in: ["sold", "booked"] },
      bookings: { none: { status: { not: "cancelled" } } },
    },
  });
  const byStatus = await prisma.booking.groupBy({ by: ["status"], _count: true });
  const byMode = await prisma.payment.groupBy({ by: ["paymentMode"], _count: true });
  const byPayStatus = await prisma.payment.groupBy({ by: ["status"], _count: true });
  const fin = await prisma.bookingFinancial.aggregate({
    _sum: { totalCost: true, valueToBeCollected: true },
  });
  const receivedAgg = await prisma.payment.aggregate({
    where: { appliesTo: "customer", status: { not: "pending" } },
    _sum: { amount: true },
  });

  console.log("Seeded UnitDesk with multi-company Indian demo data.");
  console.log(`Companies: ${companyCount} · Projects: ${projectCount} · Units: ${unitTotal}`);
  console.log(
    `Inventory sold/booked/hold: ${soldBooked} · Bookings: ${allBookedIds.length} · Orphans: ${orphan}`,
  );
  console.log(`Booking statuses: ${byStatus.map((s) => `${s.status}=${s._count}`).join(", ")}`);
  console.log(`Payment modes: ${byMode.map((s) => `${s.paymentMode}=${s._count}`).join(", ")}`);
  console.log(`Payment statuses: ${byPayStatus.map((s) => `${s.status}=${s._count}`).join(", ")}`);
  console.log(
    `Finance: sold ₹${Math.round(fin._sum.totalCost ?? 0).toLocaleString("en-IN")} · to-collect ₹${Math.round(fin._sum.valueToBeCollected ?? 0).toLocaleString("en-IN")} · received ₹${Math.round(receivedAgg._sum.amount ?? 0).toLocaleString("en-IN")}`,
  );
  console.log(`Payments: ${paymentCount} receipts · ${scheduleCount} schedule rows`);
  console.log(`Login: vipin@${DOMAIN} / Admin@123`);
  console.log(`Partner: sanjay@${DOMAIN} / Partner@123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
