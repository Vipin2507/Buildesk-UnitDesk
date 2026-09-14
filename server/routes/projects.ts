import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess, requirePermission } from "../lib/access.ts";
import { formatUnitNumber, previewCount } from "../lib/units.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";

export const projectsRouter = Router();

const projectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  location: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  reraNumber: z.string().optional().nullable(),
  reraDate: z.string().optional().nullable(),
  projectType: z.string().optional().nullable(),
  totalWings: z.number().int().min(0).optional(),
  totalFloors: z.number().int().min(0).optional(),
  unitsPerFloor: z.number().int().min(0).optional(),
  status: z.enum(["active", "upcoming", "completed", "inactive"]).optional(),
  expectedCompletion: z.string().optional().nullable(),
  launchDate: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  numberFormat: z.string().optional(),
});

const generateSchema = z.object({
  wings: z.array(z.string().min(1)).min(1),
  floorsPerWing: z.number().int().min(1),
  unitsPerFloor: z.number().int().min(1),
  numberFormat: z.string().default("[Wing]-[Floor][Unit:2]"),
  defaultType: z.string().optional(),
});

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const companyId = req.query.companyId ? String(req.query.companyId) : undefined;
    const where = {
      id: { in: ids },
      ...(companyId ? { companyId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: { company: true, _count: { select: { wings: true } } },
      }),
      prisma.project.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

projectsRouter.get(
  "/by-company/:companyId",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const where = {
      companyId: String(req.params.companyId),
      id: { in: ids },
    };
    const [data, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
      }),
      prisma.project.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

projectsRouter.post(
  "/by-company/:companyId",
  validate(projectSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as z.infer<typeof projectSchema>;
    const created = await prisma.project.create({
      data: {
        ...body,
        companyId: String(req.params.companyId),
        code: body.code.toUpperCase(),
        reraDate: body.reraDate ? new Date(body.reraDate) : null,
        expectedCompletion: body.expectedCompletion ? new Date(body.expectedCompletion) : null,
        launchDate: body.launchDate ? new Date(body.launchDate) : null,
        totalUnits:
          (body.totalWings ?? 0) * (body.totalFloors ?? 0) * (body.unitsPerFloor ?? 0),
      },
    });
    res.status(201).json(created);
  }),
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await assertProjectAccess(user, String(req.params.id));
    const project = await prisma.project.findUnique({
      where: { id: String(req.params.id) },
      include: {
        company: true,
        wings: {
          orderBy: { sortOrder: "asc" },
          include: {
            floors: {
              orderBy: { number: "asc" },
              include: { _count: { select: { units: true } } },
            },
            _count: { select: { floors: true } },
          },
        },
        commissionRules: { where: { active: true } },
      },
    });
    if (!project) throw new HttpError(404, "Project not found");
    res.json(project);
  }),
);

projectsRouter.patch(
  "/:id",
  validate(projectSchema.partial()),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    await assertProjectAccess(user, String(req.params.id));
    const body = req.body as Partial<z.infer<typeof projectSchema>>;
    const updated = await prisma.project.update({
      where: { id: String(req.params.id) },
      data: {
        ...body,
        reraDate: body.reraDate === undefined ? undefined : body.reraDate ? new Date(body.reraDate) : null,
        expectedCompletion:
          body.expectedCompletion === undefined
            ? undefined
            : body.expectedCompletion
              ? new Date(body.expectedCompletion)
              : null,
        launchDate: body.launchDate === undefined ? undefined : body.launchDate ? new Date(body.launchDate) : null,
      },
    });
    res.json(updated);
  }),
);

projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const bookings = await prisma.booking.count({
      where: { projectId, status: { not: "cancelled" } },
    });
    if (bookings > 0) {
      throw new HttpError(409, "Cannot delete a project with active bookings");
    }
    await prisma.project.delete({ where: { id: projectId } });
    res.json({ ok: true });
  }),
);

projectsRouter.post(
  "/:id/generate-units",
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const body = req.body as z.infer<typeof generateSchema>;
    const preview = previewCount(body.wings.length, body.floorsPerWing, body.unitsPerFloor);

    const existingBookings = await prisma.booking.count({
      where: { projectId, status: { not: "cancelled" } },
    });
    if (existingBookings > 0) {
      throw new HttpError(409, "Cannot regenerate inventory while active bookings exist");
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.wing.deleteMany({ where: { projectId } });
      const wings = [];
      for (const [wi, name] of body.wings.entries()) {
        const wing = await tx.wing.create({
          data: { projectId, name: name.trim(), sortOrder: wi },
        });
        for (let floorNo = 1; floorNo <= body.floorsPerWing; floorNo++) {
          const floor = await tx.floor.create({
            data: { wingId: wing.id, number: floorNo },
          });
          for (let u = 1; u <= body.unitsPerFloor; u++) {
            await tx.unit.create({
              data: {
                floorId: floor.id,
                unitNumber: formatUnitNumber(body.numberFormat, wing.name, floorNo, u),
                unitType: u === 1 ? "1BHK" : u <= 4 ? "2BHK" : "3BHK",
                configuration: u === 1 ? "1 BHK" : u <= 4 ? "2 BHK" : "3 BHK",
                carpetArea: u === 1 ? 520 : u <= 4 ? 780 : 1120,
                builtUpArea: u === 1 ? 640 : u <= 4 ? 920 : 1320,
                saleableArea: u === 1 ? 720 : u <= 4 ? 1050 : 1480,
                facing: ["East", "West", "North", "South"][(u - 1) % 4],
                parking: u === 1 ? "1 open" : "1 covered",
                basePrice: u === 1 ? 4800000 : u <= 4 ? 7200000 : 9800000,
                plc: 150000,
                otherCharges: 85000,
                sortOrder: u,
                status: "available",
              },
            });
          }
        }
        wings.push(wing);
      }
      await tx.project.update({
        where: { id: projectId },
        data: {
          totalWings: body.wings.length,
          totalFloors: body.floorsPerWing,
          unitsPerFloor: body.unitsPerFloor,
          totalUnits: preview,
          numberFormat: body.numberFormat,
        },
      });
      return { count: preview, wings: wings.length };
    });

    res.json({ ...created, preview });
  }),
);

projectsRouter.get(
  "/:id/commission-rules",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await assertProjectAccess(user, String(req.params.id));
    const data = await prisma.commissionRule.findMany({
      where: { projectId: String(req.params.id) },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

projectsRouter.post(
  "/:id/commission-rules",
  validate(
    z.object({
      name: z.string().optional(),
      type: z.enum(["percentage", "flat_per_unit", "slab"]),
      value: z.number().optional().nullable(),
      slabConfig: z
        .array(z.object({ min: z.number(), max: z.number().nullable(), rate: z.number() }))
        .optional(),
      active: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const body = req.body as {
      name?: string;
      type: string;
      value?: number | null;
      slabConfig?: unknown;
      active?: boolean;
    };
    if (body.active !== false) {
      await prisma.commissionRule.updateMany({
        where: { projectId, active: true },
        data: { active: false },
      });
    }
    const created = await prisma.commissionRule.create({
      data: {
        projectId,
        name: body.name,
        type: body.type,
        value: body.value ?? null,
        slabConfig: body.slabConfig ? JSON.stringify(body.slabConfig) : null,
        active: body.active ?? true,
      },
    });
    res.status(201).json(created);
  }),
);
