import express from "express";
import cors from "cors";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { authRequired } from "./middleware/auth.ts";
import { errorHandler } from "./lib/http.ts";
import { authRouter } from "./routes/auth.ts";
import { companiesRouter } from "./routes/companies.ts";
import { projectsRouter } from "./routes/projects.ts";
import { inventoryRouter } from "./routes/inventory.ts";
import { bookingsRouter } from "./routes/bookings.ts";
import { partnersRouter } from "./routes/partners.ts";
import { paymentsRouter } from "./routes/payments.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { employeesRouter } from "./routes/employees.ts";
import { reportsRouter } from "./routes/reports.ts";
import { customersRouter } from "./routes/customers.ts";
import { opsRouter } from "./routes/ops.ts";
import { integrationsRouter } from "./routes/integrations.ts";
import { marketingRouter } from "./routes/marketing.ts";
import { partnerAuthRouter, partnerPortalRouter, partnerRequired } from "./routes/partner.ts";
import { bootstrapPhase2 } from "./lib/bootstrap.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const envPath = path.resolve(__dirname, "../.env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  /* .env optional when process env is already set */
}

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/partner-auth", partnerAuthRouter);
app.use("/api/partner-portal", partnerRequired, partnerPortalRouter);

app.use("/api/companies", authRequired, companiesRouter);
app.use("/api/projects", authRequired, projectsRouter);
app.use("/api/bookings", authRequired, bookingsRouter);
app.use("/api/channel-partners", authRequired, partnersRouter);
app.use("/api/payments", authRequired, paymentsRouter);
app.use("/api/dashboard", authRequired, dashboardRouter);
app.use("/api/employees", authRequired, employeesRouter);
app.use("/api/reports", authRequired, reportsRouter);
app.use("/api/customers", authRequired, customersRouter);
app.use("/api/integrations", authRequired, integrationsRouter);
app.use("/api/marketing", authRequired, marketingRouter);
app.use("/api", authRequired, inventoryRouter);
app.use("/api", authRequired, opsRouter);

const distDir = path.resolve(__dirname, "../dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(distDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

app.use(errorHandler);

bootstrapPhase2()
  .catch((err) => console.error("phase2 bootstrap", err))
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`UnitDesk on http://0.0.0.0:${PORT}`);
    });
  });
