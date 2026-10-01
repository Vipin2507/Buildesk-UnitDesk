import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { formatUnitNumber } from "../server/lib/units.ts";
import { computeEntitlement, round2 } from "../server/lib/commission.ts";
import { recomputeCustomerCollection } from "../server/lib/schedule.ts";

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

const ACTIONS = [
  "view",
  "add",
  "edit",
  "book",
  "hold",
  "cancel",
  "payment_view",
  "payment_entry",
  "approve",
  "reports",
  "export",
];

const BANKS = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
const LOCALITIES = ["Baner", "Aundh", "Kothrud", "Hinjawadi", "Kalyani Nagar", "Wakad", "Viman Nagar", "Hadapsar"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function statusFor(unitNumber: string) {
  const r = hash(unitNumber) % 100;
  if (r < 9) return "sold";
  if (r < 22) return "booked";
  if (r < 28) return "hold";
  if (r < 31) return "blocked";
  if (r < 34) return "not_available";
  return "available";
}

function listPriceFor(unitTypeIndex: number, floorNo: number, wingIndex: number) {
  const base = unitTypeIndex === 1 ? 48_00_000 : unitTypeIndex <= 5 ? 72_00_000 : 98_00_000;
  const floorPremium = floorNo * 35_000;
  const wingPremium = wingIndex * 75_000;
  return round2(base + floorPremium + wingPremium);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z]+/g, ".");
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
  await prisma.company.create({
    data: {
      name: "Horizon Realty",
      code: "HRZ",
      city: "Mumbai",
      state: "Maharashtra",
      address: "Andheri East, Mumbai 400069",
      contactPerson: "Neha Kapoor",
      contactNumber: "022-40011200",
      email: `neha@${DOMAIN}`,
      status: "active",
    },
  });

  const grand = await prisma.project.create({
    data: {
      companyId: abc.id,
      name: "The Grand Residences",
      code: "TGR",
      location: "Baner, Pune",
      address: "Survey 42, Baner Road, Pune 411045",
      reraNumber: "P52100012345",
      reraDate: new Date("2024-03-12"),
      projectType: "Residential",
      totalWings: 3,
      totalFloors: 12,
      unitsPerFloor: 8,
      totalUnits: 288,
      status: "active",
      launchDate: new Date("2024-06-01"),
      expectedCompletion: new Date("2027-12-31"),
      numberFormat: "[Wing]-[Floor][Unit:2]",
    },
  });
  const plaza = await prisma.project.create({
    data: {
      companyId: abc.id,
      name: "ABC Business Plaza",
      code: "ABP",
      location: "Hinjawadi, Pune",
      address: "Phase 1, Hinjawadi, Pune 411057",
      projectType: "Commercial",
      totalWings: 1,
      totalFloors: 8,
      unitsPerFloor: 6,
      totalUnits: 0,
      status: "upcoming",
    },
  });

  await prisma.projectAccess.createMany({
    data: [
      { employeeId: admin.id, projectId: grand.id },
      { employeeId: admin.id, projectId: plaza.id },
      { employeeId: salesUser.id, projectId: grand.id },
    ],
  });

  const pctRule = await prisma.commissionRule.create({
    data: {
      projectId: grand.id,
      name: "Standard CP share",
      type: "percentage",
      value: 2.5,
      active: true,
    },
  });
  await prisma.commissionRule.create({
    data: {
      projectId: plaza.id,
      name: "Slab CP share",
      type: "slab",
      slabConfig: JSON.stringify([
        { min: 0, max: 5000000, rate: 1.5 },
        { min: 5000001, max: 10000000, rate: 2 },
        { min: 10000001, max: null, rate: 2.75 },
      ]),
      active: true,
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
  ]);

  const wingNames = ["A", "B", "C"];
  const units: { id: string; number: string; status: string; listPrice: number; unitType: string }[] = [];

  for (const [wi, name] of wingNames.entries()) {
    const wing = await prisma.wing.create({
      data: { projectId: grand.id, name, sortOrder: wi },
    });
    for (let floorNo = 1; floorNo <= 12; floorNo++) {
      const floor = await prisma.floor.create({
        data: { wingId: wing.id, number: floorNo },
      });
      for (let u = 1; u <= 8; u++) {
        const unitNumber = formatUnitNumber("[Wing]-[Floor][Unit:2]", name, floorNo, u);
        const st = statusFor(unitNumber);
        const basePrice = listPriceFor(u, floorNo, wi);
        const plc = 1_50_000 + (floorNo > 8 ? 50_000 : 0);
        const otherCharges = 85_000;
        const created = await prisma.unit.create({
          data: {
            floorId: floor.id,
            unitNumber,
            unitType: u === 1 ? "1BHK" : u <= 5 ? "2BHK" : "3BHK",
            configuration: u === 1 ? "1 BHK" : u <= 5 ? "2 BHK" : "3 BHK",
            carpetArea: u === 1 ? 520 : u <= 5 ? 780 : 1120,
            builtUpArea: u === 1 ? 640 : u <= 5 ? 920 : 1320,
            saleableArea: u === 1 ? 720 : u <= 5 ? 1050 : 1480,
            balconyArea: 65,
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
          unitType: created.unitType ?? "2BHK",
        });
      }
    }
  }

  const bookable = units.filter((u) => u.status === "sold" || u.status === "booked");
  let seq = 1;
  const names = [
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
  ];

  const bookedIds: string[] = [];

  for (const [i, unit] of bookable.entries()) {
    // Agreement ≈ 90–105% of current list price so inventory value vs sold value is analysable
    const agreement = round2(unit.listPrice * (0.9 + (hash(unit.number) % 16) / 100));
    const gst = Math.round(agreement * 0.05);
    const otherCharges = 85000;
    const gstOnAgreement = Math.round(agreement * 0.01);
    const stampDutyRegistration = Math.round(agreement * 0.05) + 45000;
    const totalCost = round2(agreement + gst + otherCharges + gstOnAgreement + stampDutyRegistration);
    // Vary bank finance share so value-to-collect / outstanding differ by booking
    const financeShare = [0.7, 0.75, 0.8, 0.85, 0][i % 5];
    const finance = round2(totalCost * financeShare);
    const valueToBeCollected = round2(Math.max(0, totalCost - finance));
    const partner = i % 3 === 0 ? partners[0] : i % 3 === 1 ? partners[1] : null;
    const snap = partner ? computeEntitlement(pctRule, totalCost) : null;
    const date = monthsAgo(1 + (i % 10), (i % 25) + 1);
    const buyer = names[i % names.length];
    const mail = `${slug(buyer)}${i >= names.length ? i : ""}@${DOMAIN}`;
    const booking = await prisma.booking.create({
      data: {
        bookingNumber: `BK-2025-${String(seq++).padStart(4, "0")}`,
        bookingDate: date,
        projectId: grand.id,
        unitId: unit.id,
        salesEmployeeId: salesUser.id,
        channelPartnerId: partner?.id,
        status: unit.status === "sold" ? "confirmed" : "booked",
        customers: {
          create: [
            {
              role: "primary",
              name: buyer,
              mobile: `98${String(20000000 + i).slice(0, 8)}`,
              email: mail,
              pan: `ABCDE${String(1234 + i).padStart(4, "0")}F`,
              address: `${LOCALITIES[i % LOCALITIES.length]}, Pune`,
            },
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

    if (partner && snap) {
      const received = i % 2 === 0 ? round2(snap.amount * 0.4) : 0;
      await prisma.partnerEntitlement.create({
        data: {
          bookingId: booking.id,
          ruleId: pctRule.id,
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
            utrOrCheque: `HDFCN${900000 + i}`,
            bank: BANKS[i % BANKS.length],
            appliesTo: "partner",
            status: "verified",
            remarks: "Partner commission payout",
            addedBy: admin.id,
          },
        });
      } else if (i % 6 === 0) {
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
            addedBy: salesUser.id,
          },
        });
      }
    }

    // Customer receipts — varied patterns against value-to-be-collected
    const collect = valueToBeCollected;
    const bookingAmt = round2(collect * 0.2);
    const slab = round2(collect * 0.15);
    const mode = PAYMENT_MODES[i % PAYMENT_MODES.length];
    const bank = BANKS[i % BANKS.length];
    const pattern = i % 7;

    const customerPayments: {
      amount: number;
      paymentDate: Date;
      paymentMode: (typeof PAYMENT_MODES)[number];
      status: (typeof PAYMENT_STATUSES)[number];
      utrOrCheque: string;
      remarks?: string;
    }[] = [];

    if (pattern === 0) {
      // Nearly collected across older + this-month receipts
      customerPayments.push(
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
      // Token / booking amount only
      customerPayments.push({
        amount: bookingAmt,
        paymentDate: monthsAgo(2, 10 + (i % 8)),
        paymentMode: mode,
        status: "received",
        utrOrCheque: mode === "cheque" ? `CHQ${1100 + i}` : `UPI${300300 + i}`,
        remarks: "Booking token",
      });
    } else if (pattern === 2) {
      // Partial received + pending cheque
      customerPayments.push(
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
      // No customer payment yet — full outstanding (optional draft pending)
      if (i % 2 === 0) {
        customerPayments.push({
          amount: Math.min(100000, bookingAmt),
          paymentDate: daysFromNow(0),
          paymentMode: "upi",
          status: "pending",
          utrOrCheque: `${slug(buyer)}@paytm`,
          remarks: "Customer promised — not yet cleared",
        });
      }
    } else if (pattern === 4) {
      // Strong this-month collections for KPI
      customerPayments.push(
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
      // Fully / almost fully collected
      const a1 = bookingAmt;
      const a2 = round2(collect * 0.3);
      const a3 = round2(Math.max(0, collect - a1 - a2));
      customerPayments.push(
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
    } else {
      // Mid collection + cash
      customerPayments.push({
        amount: round2(bookingAmt + slab * 0.5),
        paymentDate: monthsAgo(1, 22),
        paymentMode: i % 2 ? "cash" : "upi",
        status: "received",
        utrOrCheque: i % 2 ? `CASH-${1000 + i}` : `${slug(buyer)}@ybl`,
        remarks: i % 2 ? "Cash at site office" : "UPI receipt",
      });
    }

    let running = 0;
    for (const [pi, p] of customerPayments.entries()) {
      // Cap non-pending amounts so seed never exceeds value-to-be-collected
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
          addedBy: pi % 2 ? admin.id : salesUser.id,
          verifiedBy: p.status === "verified" || p.status === "reconciled" ? admin.id : null,
        },
      });
    }
  }

  for (const bookingId of bookedIds) {
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
  const soldBooked = await prisma.unit.count({ where: { status: { in: ["sold", "booked"] } } });
  const orphan = await prisma.unit.count({
    where: {
      status: { in: ["sold", "booked"] },
      bookings: { none: { status: { not: "cancelled" } } },
    },
  });
  const fin = await prisma.bookingFinancial.aggregate({
    _sum: { totalCost: true, valueToBeCollected: true },
  });
  const receivedAgg = await prisma.payment.aggregate({
    where: { appliesTo: "customer", status: { not: "pending" } },
    _sum: { amount: true },
  });
  console.log("Seeded UnitDesk with Indian demo data.");
  console.log(
    `Inventory: ${units.length} units · ${soldBooked} sold/booked · ${bookedIds.length} bookings · ${orphan} orphans`,
  );
  console.log(
    `Finance: sold ${Math.round(fin._sum.totalCost ?? 0).toLocaleString("en-IN")} · to-collect ${Math.round(fin._sum.valueToBeCollected ?? 0).toLocaleString("en-IN")} · received ${Math.round(receivedAgg._sum.amount ?? 0).toLocaleString("en-IN")}`,
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
