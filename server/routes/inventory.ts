import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { assertProjectAccess, requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { audit } from "../lib/audit.ts";

export const inventoryRouter = Router();

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

    const wings = await prisma.wing.findMany({
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
    });

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

    const wingSummaries = wings.map((w) => {
      const units = w.floors.flatMap((f) => f.units);
      const sold = units.filter((u) => u.status === "sold" || u.status === "booked").length;
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
    };
    const floorMap = new Map<number, FloorUnit[]>();
    for (const wing of wings) {
      for (const floor of wing.floors) {
        const existing = floorMap.get(floor.number) ?? [];
        floorMap.set(floor.number, [
          ...existing,
          ...floor.units.map((u) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            status: u.status,
            unitType: u.unitType,
            configuration: u.configuration,
            photoUrl: u.photoUrl,
            sortOrder: u.sortOrder,
            wingId: wing.id,
            wingName: wing.name,
          })),
        ]);
      }
    }
    const floors = [...floorMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([number, units]) => ({ number, units }));

    res.json({
      project,
      kpis,
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
          include: { customers: true, financials: true },
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
    res.json(unit);
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
