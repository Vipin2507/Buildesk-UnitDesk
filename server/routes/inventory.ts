import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { assertProjectAccess, requirePermission } from "../lib/access.ts";
import { round2 } from "../lib/commission.ts";
import { collectableAmount } from "../lib/schedule.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { audit } from "../lib/audit.ts";

export const inventoryRouter = Router();

function unitListPrice(u: {
  basePrice?: number | null;
  plc?: number | null;
  otherCharges?: number | null;
}) {
  return round2((u.basePrice ?? 0) + (u.plc ?? 0) + (u.otherCharges ?? 0));
}

inventoryRouter.get(
  "/projects/:id/inventory",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId, {
      wingId: req.query.wing ? String(req.query.wing) : undefined,
    });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { company: true },
    });
    if (!project) throw new HttpError(404, "Project not found");

    const wingFilter = req.query.wing ? String(req.query.wing) : undefined;
    const statusFilter = req.query.status ? String(req.query.status) : undefined;
    const typeFilter = req.query.unitType ? String(req.query.unitType) : undefined;

    const [wings, bookings] = await Promise.all([
      prisma.wing.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
        include: {
          floors: {
            orderBy: { number: "desc" },
            include: {
              units: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      }),
      prisma.booking.findMany({
        where: { projectId, status: { not: "cancelled" } },
        include: {
          financials: true,
          payments: { where: { appliesTo: "customer" } },
          customers: { where: { role: "primary" }, take: 1 },
        },
      }),
    ]);

    const bookingByUnit = new Map(bookings.map((b) => [b.unitId, b]));

    const allUnits = wings.flatMap((w) => w.floors.flatMap((f) => f.units));
    const countBy = (status: string) => allUnits.filter((u) => u.status === status).length;
    const kpis = {
      total: allUnits.length || project.totalUnits,
      available: countBy("available"),
      sold: countBy("sold"),
      hold: countBy("hold"),
      blocked: countBy("blocked"),
      booked: countBy("booked"),
      not_available: countBy("not_available"),
    };

    let totalValue = 0;
    let totalSold = 0;
    let totalReceived = 0;
    let totalToCollect = 0;

    for (const u of allUnits) {
      const listPrice = unitListPrice(u);
      const booking = bookingByUnit.get(u.id);
      if (booking?.financials) {
        const soldValue = round2(booking.financials.totalCost ?? 0);
        const toCollect = collectableAmount(booking.financials);
        const received = round2(
          booking.payments
            .filter((p) => p.status !== "pending")
            .reduce((s, p) => s + p.amount, 0),
        );
        totalValue += soldValue || listPrice;
        totalSold += soldValue;
        totalToCollect += toCollect;
        totalReceived += received;
      } else {
        totalValue += listPrice;
      }
    }

    const totalRemaining = round2(
      allUnits
        .filter((u) => u.status === "available" || u.status === "hold")
        .reduce((s, u) => s + unitListPrice(u), 0),
    );
    totalValue = round2(totalValue);
    totalSold = round2(totalSold);
    totalReceived = round2(totalReceived);
    totalToCollect = round2(totalToCollect);
    const totalOutstanding = round2(Math.max(0, totalToCollect - totalReceived));

    const finance = {
      totalValue,
      totalSold,
      totalRemaining,
      totalReceived,
      totalToCollect,
      totalOutstanding,
      bookedUnits: kpis.sold + kpis.booked,
      collectionPct: totalToCollect ? Math.round((totalReceived / totalToCollect) * 1000) / 10 : 0,
    };

    const wingSummaries = wings.map((w) => {
      const units = w.floors.flatMap((f) => f.units);
      const sold = units.filter((u) => u.status === "sold" || u.status === "booked").length;
      let wingSoldValue = 0;
      let wingReceived = 0;
      let wingRemaining = 0;
      for (const u of units) {
        const booking = bookingByUnit.get(u.id);
        if (booking?.financials) {
          wingSoldValue += booking.financials.totalCost ?? 0;
          wingReceived += booking.payments
            .filter((p) => p.status !== "pending")
            .reduce((s, p) => s + p.amount, 0);
        }
        if (u.status === "available" || u.status === "hold") {
          wingRemaining += unitListPrice(u);
        }
      }
      return {
        id: w.id,
        name: w.name,
        total: units.length,
        available: units.filter((u) => u.status === "available").length,
        sold: units.filter((u) => u.status === "sold").length,
        booked: units.filter((u) => u.status === "booked").length,
        hold: units.filter((u) => u.status === "hold").length,
        blocked: units.filter((u) => u.status === "blocked").length,
        pctSold: units.length ? Math.round((sold / units.length) * 100) : 0,
        soldValue: round2(wingSoldValue),
        received: round2(wingReceived),
        remainingValue: round2(wingRemaining),
      };
    });

    type FloorUnit = {
      id: string;
      unitNumber: string;
      status: string;
      unitType: string | null;
      configuration: string | null;
      photoUrl: string | null;
      sortOrder: number;
      wingId: string;
      wingName: string;
      basePrice: number | null;
      listPrice: number;
      booking: {
        id: string;
        bookingNumber: string;
        bookingDate: Date;
        customerName: string | null;
        soldValue: number;
        toCollect: number;
        received: number;
        outstanding: number;
      } | null;
    };
    const floorMap = new Map<number, FloorUnit[]>();
    for (const wing of wings) {
      for (const floor of wing.floors) {
        const existing = floorMap.get(floor.number) ?? [];
        floorMap.set(floor.number, [
          ...existing,
          ...floor.units.map((u) => {
            const booking = bookingByUnit.get(u.id);
            const soldValue = round2(booking?.financials?.totalCost ?? 0);
            const toCollect = collectableAmount(booking?.financials ?? null);
            const received = round2(
              (booking?.payments ?? [])
                .filter((p) => p.status !== "pending")
                .reduce((s, p) => s + p.amount, 0),
            );
            return {
              id: u.id,
              unitNumber: u.unitNumber,
              status: u.status,
              unitType: u.unitType,
              configuration: u.configuration,
              photoUrl: u.photoUrl,
              sortOrder: u.sortOrder,
              wingId: wing.id,
              wingName: wing.name,
              basePrice: u.basePrice,
              listPrice: unitListPrice(u),
              booking: booking
                ? {
                    id: booking.id,
                    bookingNumber: booking.bookingNumber,
                    bookingDate: booking.bookingDate,
                    customerName: booking.customers[0]?.name ?? null,
                    soldValue,
                    toCollect,
                    received,
                    outstanding: round2(Math.max(0, toCollect - received)),
                  }
                : null,
            };
          }),
        ]);
      }
    }
    const floors = [...floorMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([number, units]) => ({ number, units }));

    res.json({
      project,
      kpis,
      finance,
      wings: wingSummaries,
      floors,
      filters: { wing: wingFilter ?? null, status: statusFilter ?? null, unitType: typeFilter ?? null },
    });
  }),
);

inventoryRouter.get(
  "/projects/:id/units",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const where = {
      floor: {
        wing: {
          projectId,
          ...(req.query.wing ? { name: String(req.query.wing) } : {}),
        },
        ...(req.query.floor ? { number: Number(req.query.floor) } : {}),
      },
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(search ? { unitNumber: { contains: search } } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        skip,
        take,
        orderBy: { unitNumber: "asc" },
        include: { floor: { include: { wing: true } } },
      }),
      prisma.unit.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

inventoryRouter.get(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({
      where: { id: String(req.params.id) },
      include: {
        floor: { include: { wing: { include: { project: true } } } },
        bookings: {
          where: { status: { not: "cancelled" } },
          orderBy: { bookingDate: "desc" },
          include: {
            customers: true,
            financials: true,
            payments: { orderBy: { paymentDate: "desc" } },
            channelPartner: true,
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!unit) throw new HttpError(404, "Unit not found");
    const user = requireUser(req);
    await assertProjectAccess(user, unit.floor.wing.projectId, {
      wingId: unit.floor.wingId,
      unitId: unit.id,
    });

    const listPrice = unitListPrice(unit);
    const bookings = unit.bookings.map((b) => {
      const toCollect = collectableAmount(b.financials);
      const customerReceived = round2(
        b.payments
          .filter((p) => p.appliesTo === "customer" && p.status !== "pending")
          .reduce((s, p) => s + p.amount, 0),
      );
      const partnerReceived = round2(
        b.payments
          .filter((p) => p.appliesTo === "partner" && p.status !== "pending")
          .reduce((s, p) => s + p.amount, 0),
      );
      return {
        ...b,
        toCollect,
        received: customerReceived,
        partnerReceived,
        outstanding: round2(Math.max(0, toCollect - customerReceived)),
        collectionPct: toCollect ? Math.round((customerReceived / toCollect) * 1000) / 10 : 0,
      };
    });

    res.json({
      ...unit,
      listPrice,
      bookings,
    });
  }),
);

inventoryRouter.patch(
  "/units/:id",
  validate(
    z.object({
      unitType: z.string().optional().nullable(),
      configuration: z.string().optional().nullable(),
      carpetArea: z.number().optional().nullable(),
      builtUpArea: z.number().optional().nullable(),
      saleableArea: z.number().optional().nullable(),
      balconyArea: z.number().optional().nullable(),
      facing: z.string().optional().nullable(),
      parking: z.string().optional().nullable(),
      basePrice: z.number().optional().nullable(),
      plc: z.number().optional().nullable(),
      otherCharges: z.number().optional().nullable(),
      remarks: z.string().optional().nullable(),
      photoUrl: z.string().optional().nullable(),
      unitNumber: z.string().optional(),
      status: z
        .enum(["available", "hold", "booked", "sold", "blocked", "not_available"])
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const existing = await prisma.unit.findUnique({
      where: { id: String(req.params.id) },
      include: { floor: { include: { wing: true } }, bookings: { where: { status: { not: "cancelled" } } } },
    });
    if (!existing) throw new HttpError(404, "Unit not found");
    await assertProjectAccess(user, existing.floor.wing.projectId, {
      wingId: existing.floor.wingId,
      unitId: existing.id,
    });
    const body = req.body as { status?: string };
    if (body.status && ["hold", "blocked"].includes(body.status)) {
      requirePermission(user, "hold");
    }
    if (body.status && existing.bookings.length && body.status === "available") {
      throw new HttpError(409, "Unit has an active booking");
    }
    const updated = await prisma.unit.update({
      where: { id: existing.id },
      data: req.body,
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: body.status ? `unit.status.${body.status}` : "unit.update",
      entityType: "unit",
      entityId: existing.id,
      projectId: existing.floor.wing.projectId,
      meta: req.body,
    });
    res.json(updated);
  }),
);

const unitWriteSchema = z.object({
  unitNumber: z.string().min(1),
  wingId: z.string().min(1),
  floorNumber: z.number().int().min(0),
  unitType: z.string().optional().nullable(),
  configuration: z.string().optional().nullable(),
  carpetArea: z.number().optional().nullable(),
  builtUpArea: z.number().optional().nullable(),
  saleableArea: z.number().optional().nullable(),
  balconyArea: z.number().optional().nullable(),
  facing: z.string().optional().nullable(),
  parking: z.string().optional().nullable(),
  basePrice: z.number().optional().nullable(),
  plc: z.number().optional().nullable(),
  otherCharges: z.number().optional().nullable(),
  remarks: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  status: z.enum(["available", "hold", "booked", "sold", "blocked", "not_available"]).optional(),
});

inventoryRouter.post(
  "/projects/:id/units",
  validate(unitWriteSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const body = req.body as z.infer<typeof unitWriteSchema>;
    const wing = await prisma.wing.findFirst({ where: { id: body.wingId, projectId } });
    if (!wing) throw new HttpError(404, "Wing not found");
    const dup = await prisma.unit.findFirst({
      where: { unitNumber: body.unitNumber, floor: { wing: { projectId } } },
    });
    if (dup) throw new HttpError(409, "A unit with this number already exists");
    const floor = await prisma.floor.upsert({
      where: { wingId_number: { wingId: wing.id, number: body.floorNumber } },
      create: { wingId: wing.id, number: body.floorNumber },
      update: {},
    });
    const last = await prisma.unit.aggregate({
      where: { floorId: floor.id },
      _max: { sortOrder: true },
    });
    const created = await prisma.unit.create({
      data: {
        floorId: floor.id,
        unitNumber: body.unitNumber,
        unitType: body.unitType ?? null,
        configuration: body.configuration ?? null,
        carpetArea: body.carpetArea ?? null,
        builtUpArea: body.builtUpArea ?? null,
        saleableArea: body.saleableArea ?? null,
        balconyArea: body.balconyArea ?? null,
        facing: body.facing ?? null,
        parking: body.parking ?? null,
        basePrice: body.basePrice ?? null,
        plc: body.plc ?? null,
        otherCharges: body.otherCharges ?? null,
        remarks: body.remarks ?? null,
        photoUrl: body.photoUrl ?? null,
        status: body.status ?? "available",
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { totalUnits: { increment: 1 } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "unit.create",
      entityType: "unit",
      entityId: created.id,
      projectId,
      meta: { unitNumber: created.unitNumber },
    });
    res.status(201).json(created);
  }),
);

inventoryRouter.delete(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const existing = await prisma.unit.findUnique({
      where: { id: String(req.params.id) },
      include: {
        floor: { include: { wing: true } },
        bookings: { where: { status: { not: "cancelled" } } },
      },
    });
    if (!existing) throw new HttpError(404, "Unit not found");
    await assertProjectAccess(user, existing.floor.wing.projectId, {
      wingId: existing.floor.wingId,
      unitId: existing.id,
    });
    if (existing.bookings.length) {
      throw new HttpError(409, "Cannot delete a unit with an active booking");
    }
    await prisma.unit.delete({ where: { id: existing.id } });
    await prisma.project.update({
      where: { id: existing.floor.wing.projectId },
      data: { totalUnits: { decrement: 1 } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "unit.delete",
      entityType: "unit",
      entityId: existing.id,
      projectId: existing.floor.wing.projectId,
      meta: { unitNumber: existing.unitNumber },
    });
    res.json({ ok: true });
  }),
);
