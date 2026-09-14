import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";

export const customersRouter = Router();

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const where = {
      booking: { projectId: { in: ids } },
      ...(search
        ? { OR: [{ name: { contains: search } }, { mobile: { contains: search } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: {
          booking: { include: { unit: true, project: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);
