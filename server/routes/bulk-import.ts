import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import {
  fileBufferToCsv,
  getKindMeta,
  IMPORT_KINDS,
  runImport,
  sheetNameFor,
  templateCsv,
  templateXlsx,
  type ImportKind,
} from "../lib/bulk-import.ts";

export const bulkImportRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.mimetype.includes("csv") ||
      file.mimetype.includes("sheet") ||
      file.mimetype.includes("excel") ||
      file.mimetype.includes("text");
    if (!ok) {
      cb(new Error("Upload an Excel (.xlsx) sheet or CSV file"));
      return;
    }
    cb(null, true);
  },
});

bulkImportRouter.get(
  "/kinds",
  asyncHandler(async (req, res) => {
    requireUser(req);
    res.json({
      data: IMPORT_KINDS.map((k) => ({
        id: k.id,
        label: k.label,
        sheetName: sheetNameFor(k.id),
        description: k.description,
        permission: k.permission,
        order: k.order,
        columns: k.columns,
      })),
    });
  }),
);

bulkImportRouter.get(
  "/templates/:kind",
  asyncHandler(async (req, res) => {
    requireUser(req);
    const kind = String(req.params.kind) as ImportKind;
    try {
      getKindMeta(kind);
    } catch {
      throw new HttpError(404, "Unknown template");
    }
    const format = String(req.query.format ?? "xlsx").toLowerCase();
    if (format === "csv") {
      const csv = templateCsv(kind);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="unitdesk-${kind}-sheet.csv"`,
      );
      res.send(csv);
      return;
    }
    const buf = templateXlsx(kind);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="unitdesk-${kind}-sheet.xlsx"`,
    );
    res.send(buf);
  }),
);

/** JSON body alternative for paste import */
bulkImportRouter.post(
  "/:kind/text",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const kind = String(req.params.kind) as ImportKind;
    let meta;
    try {
      meta = getKindMeta(kind);
    } catch {
      throw new HttpError(404, "Unknown import kind");
    }
    requirePermission(user, meta.permission);

    const parsed = z
      .object({
        csv: z.string().min(1),
        dryRun: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, "csv text required");

    const result = await runImport(kind, parsed.data.csv, {
      dryRun: parsed.data.dryRun ?? false,
      user,
    });
    res.json(result);
  }),
);

bulkImportRouter.post(
  "/:kind",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return next(new HttpError(400, err.message || "Upload failed"));
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const kind = String(req.params.kind) as ImportKind;
    let meta;
    try {
      meta = getKindMeta(kind);
    } catch {
      throw new HttpError(404, "Unknown import kind");
    }
    requirePermission(user, meta.permission);

    const dryRun =
      String(req.query.dryRun ?? req.body?.dryRun ?? "false").toLowerCase() === "true" ||
      req.body?.dryRun === true;

    if (!req.file?.buffer) {
      throw new HttpError(400, `Upload the ${sheetNameFor(kind)} Excel sheet (.xlsx) or CSV`);
    }

    let csvText: string;
    try {
      csvText = fileBufferToCsv(req.file.buffer, req.file.originalname, kind);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Could not read sheet");
    }

    const result = await runImport(kind, csvText, { dryRun, user });
    res.json({ ...result, sheetName: sheetNameFor(kind) });
  }),
);
