import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, grantDefaultAccessOnProjectCreate, requirePermission } from "../lib/access.ts";
import { projectMandateFields, syncProjectMandate } from "../lib/project-mandate.ts";
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

const companyProjectSchema = z.object({
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
  ...projectMandateFields,
});

companiesRouter.post(
  "/:id/projects",
  validate(companyProjectSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const { assertCanCreateProject } = await import("../lib/plan-limits.ts");
    await assertCanCreateProject(req);
    const body = req.body as z.infer<typeof companyProjectSchema>;
    const { brokerageMilestones, ...projectBody } = body;
    const created = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          ...projectBody,
          companyId: String(req.params.id),
          code: body.code.toUpperCase(),
          reraDate: body.reraDate ? new Date(body.reraDate) : null,
          expectedCompletion: body.expectedCompletion ? new Date(body.expectedCompletion) : null,
          launchDate: body.launchDate ? new Date(body.launchDate) : null,
          totalUnits:
            (body.totalWings ?? 0) * (body.totalFloors ?? 0) * (body.unitsPerFloor ?? 0),
        },
      });
      const synced = await syncProjectMandate(tx, project.id, {
        agreedMandateBrokerage: body.agreedMandateBrokerage,
        brokerageMilestones,
      });
      if (synced.totalBrokeragePct != null) {
        return tx.project.update({
          where: { id: project.id },
          data: { totalBrokeragePct: synced.totalBrokeragePct },
          include: { brokerageMilestones: { orderBy: { sortOrder: "asc" } } },
        });
      }
      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { brokerageMilestones: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await grantDefaultAccessOnProjectCreate(created.id, user.id);
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
