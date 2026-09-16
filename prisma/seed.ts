import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { formatUnitNumber } from "../server/lib/units.ts";
import { computeEntitlement } from "../server/lib/commission.ts";

const prisma = new PrismaClient();
const DOMAIN = "cravingcode.in";

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
  if (r < 16) return "booked";
  if (r < 22) return "hold";
  if (r < 26) return "blocked";
  if (r < 30) return "not_available";
  return "available";
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
  const units: { id: string; number: string; status: string }[] = [];

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
            basePrice: u === 1 ? 4800000 : u <= 5 ? 7200000 : 9800000,
            plc: 150000,
            otherCharges: 85000,
            sortOrder: u,
            status: st,
          },
        });
        units.push({ id: created.id, number: unitNumber, status: st });
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
  ];

  for (const [i, unit] of bookable.slice(0, 36).entries()) {
    const dealWithoutGst =
      unit.number.endsWith("06") || unit.number.endsWith("07") || unit.number.endsWith("08") ? 1_07_14_286 : 80_76_190;
    const gst = Math.round(dealWithoutGst * 0.05);
    const discount = 50000;
    const totalDealValue = Math.max(0, dealWithoutGst + gst - discount);
    const receivedPayment = Math.round(totalDealValue * 0.1);
    const pendingAmount = Math.max(0, totalDealValue - receivedPayment);
    const partner = i % 3 === 0 ? partners[0] : i % 3 === 1 ? partners[1] : null;
    const snap = partner ? computeEntitlement(pctRule, totalDealValue) : null;
    const date = new Date(2025, (i % 10) + 1, (i % 27) + 1);
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
            totalDealValue,
            dealValueWithoutGst: dealWithoutGst,
            gst,
            discount,
            receivedPayment,
            pendingAmount,
          },
        },
      },
    });
    if (partner && snap) {
      const received = i % 2 === 0 ? Math.round(snap.amount * 0.4) : 0;
      await prisma.partnerEntitlement.create({
        data: {
          bookingId: booking.id,
          ruleId: pctRule.id,
          entitlementPercent: snap.percent,
          entitlementAmount: snap.amount,
          received,
          outstanding: snap.amount - received,
        },
      });
      if (received) {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            paymentDate: date,
            amount: received,
            paymentMode: "neft",
            utrOrCheque: `HDFCN${900000 + i}`,
            bank: BANKS[i % BANKS.length],
            appliesTo: "partner",
            status: "verified",
            addedBy: admin.id,
          },
        });
      }
    }
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        paymentDate: date,
        amount: 200000,
        paymentMode: i % 2 ? "upi" : "cheque",
        utrOrCheque: i % 2 ? `${slug(buyer)}@okhdfcbank` : `CHQ${1000 + i}`,
        bank: BANKS[(i + 2) % BANKS.length],
        appliesTo: "customer",
        status: "received",
        addedBy: salesUser.id,
      },
    });
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

  console.log("Seeded UnitDesk with Indian demo data.");
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
