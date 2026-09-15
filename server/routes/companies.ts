import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";

export const companiesRouter = Router();

const companySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  gst: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  contactNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  logoUrl: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

companiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const q = String(req.query.search ?? "").trim();
    const user = requireUser(req);
    const projectIds = await accessibleProjectIds(user);
    const where = {
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { code: { contains: q } },
              { city: { contains: q } },
            ],
          }
        : {}),
      ...(user.isSuperAdmin ? {} : { projects: { some: { id: { in: projectIds } } } }),
    };
    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: { _count: { select: { projects: true } } },
      }),
      prisma.company.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

companiesRouter.post(
  "/",
  validate(companySchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as z.infer<typeof companySchema>;
    const created = await prisma.company.create({
      data: { ...body, email: body.email || null, code: body.code.toUpperCase() },
    });
    res.status(201).json(created);
  }),
);

companiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: String(req.params.id) },
      include: { _count: { select: { projects: true } } },
    });
    if (!company) throw new HttpError(404, "Company not found");
    res.json(company);
  }),
);

companiesRouter.patch(
  "/:id",
  validate(companySchema.partial()),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const body = req.body as Partial<z.infer<typeof companySchema>>;
    const updated = await prisma.company.update({
      where: { id: String(req.params.id) },
      data: { ...body, email: body.email || null },
    });
    res.json(updated);
  }),
);

companiesRouter.get(
  "/:id/projects",
  asyncHandler(async (req, res) => {
    req.query.companyId = String(req.params.id);
    const { page, pageSize, skip, take } = listMeta(req);
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const where = { companyId: String(req.params.id), id: { in: ids } };
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

companiesRouter.post(
  "/:id/projects",
  validate(
    z.object({
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
      plan1bhkUrl: z.string().optional().nullable(),
      plan2bhkUrl: z.string().optional().nullable(),
      plan3bhkUrl: z.string().optional().nullable(),
      numberFormat: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as {
      name: string;
      code: string;
      location?: string | null;
      address?: string | null;
      reraNumber?: string | null;
      reraDate?: string | null;
      projectType?: string | null;
      totalWings?: number;
      totalFloors?: number;
      unitsPerFloor?: number;
      status?: string;
      expectedCompletion?: string | null;
      launchDate?: string | null;
      photoUrl?: string | null;
      plan1bhkUrl?: string | null;
      plan2bhkUrl?: string | null;
      plan3bhkUrl?: string | null;
      numberFormat?: string;
    };
    const created = await prisma.project.create({
      data: {
        ...body,
        companyId: String(req.params.id),
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

companiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const id = String(req.params.id);
    const company = await prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!company) throw new HttpError(404, "Company not found");
    if (company._count.projects > 0) {
      throw new HttpError(409, "Remove this company's projects before deleting it");
    }
    await prisma.company.delete({ where: { id } });
    res.json({ ok: true });
  }),
);
