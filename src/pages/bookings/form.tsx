import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Customer = {
  role: "primary" | "co_applicant" | "nominee";
  name: string;
  mobile: string;
  email: string;
  pan: string;
};

type InstallmentRow = {
  name: string;
  afterDays: string;
  amount: string;
};

/** Weights matching the sample breakup (5k / 15k / 10k / 5k / 5k). */
const INSTALLMENT_TEMPLATE = [
  { afterDays: 10, weight: 1 },
  { afterDays: 30, weight: 3 },
  { afterDays: 45, weight: 2 },
  { afterDays: 60, weight: 1 },
  { afterDays: 75, weight: 1 },
] as const;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function buildDefaultInstallments(collect: number): InstallmentRow[] {
  const totalWeight = INSTALLMENT_TEMPLATE.reduce((s, r) => s + r.weight, 0);
  let remaining = roundMoney(Math.max(0, collect));
  return INSTALLMENT_TEMPLATE.map((row, i) => {
    const isLast = i === INSTALLMENT_TEMPLATE.length - 1;
    const amount = isLast
      ? remaining
      : roundMoney((Math.max(0, collect) * row.weight) / totalWeight);
    if (!isLast) remaining = roundMoney(remaining - amount);
    return {
      name: `Installment ${i + 1}`,
      afterDays: String(row.afterDays),
      amount: collect > 0 ? String(amount) : "",
    };
  });
}

function addDaysIso(dateStr: string, days: number) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONEY_FIELDS = [
  ["agreement", "Agreement"],
  ["gst", "GST"],
  ["otherCharges", "Other charges"],
  ["totalCost", "Total cost"],
  ["gstOnAgreement", "GST on agreement"],
  ["stampDutyRegistration", "Stamp duty registration"],
  ["valueToBeCollected", "Value to be collected"],
  ["finance", "Finance"],
] as const;

export function BookingFormPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState(params.get("projectId") ?? "");
  const [unitId, setUnitId] = useState(params.get("unitId") ?? "");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("booked");
  const [customers, setCustomers] = useState<Customer[]>([
    { role: "primary", name: "", mobile: "", email: "", pan: "" },
  ]);
  const [financials, setFinancials] = useState({
    agreement: 0,
    gst: 0,
    otherCharges: 0,
    totalCost: 0,
    gstOnAgreement: 0,
    stampDutyRegistration: 0,
    valueToBeCollected: 0,
    finance: 0,
  });
  const [pendingFiles, setPendingFiles] = useState<{ file: File; category: string }[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [installments, setInstallments] = useState<InstallmentRow[]>(() => buildDefaultInstallments(0));
  const [installmentsTouched, setInstallmentsTouched] = useState(false);

  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<{ id: string; name: string }>>("/api/projects", { pageSize: 50 }),
  });
  const { data: units } = useQuery({
    queryKey: qk.units(projectId, { available: true }),
    queryFn: () =>
      api.get<ListResponse<{ id: string; unitNumber: string; status: string; basePrice: number | null }>>(
        `/api/projects/${projectId}/units`,
        { status: "available", pageSize: 200 },
      ),
    enabled: Boolean(projectId),
  });
  const { data: partners } = useQuery({
    queryKey: qk.partners,
    queryFn: () => api.get<ListResponse<{ id: string; name: string }>>("/api/channel-partners", { pageSize: 50 }),
  });
  const { data: rules } = useQuery({
    queryKey: qk.commissionRules(projectId),
    queryFn: () =>
      api.get<ListResponse<{ type: string; value: number | null; active: boolean }>>(
        `/api/projects/${projectId}/commission-rules`,
      ),
    enabled: Boolean(projectId),
  });
  const { data: projectMandate } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () =>
      api.get<{
        agreedMandateBrokerage: number | null;
        mandateBrokeragePaymentTerm: string | null;
        brokerageMilestones: { collectionPct: number; brokeragePct: number }[];
      }>(`/api/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const selectedUnit = units?.data.find((u) => u.id === unitId);
  const activeRule = rules?.data.find((r) => r.active);
  const partnerShare =
    activeRule?.type === "percentage"
      ? (financials.totalCost * (activeRule.value ?? 0)) / 100
      : activeRule?.type === "flat_per_unit"
        ? (activeRule.value ?? 0)
        : 0;

  function patchFinancials(patch: Partial<typeof financials>) {
    setFinancials((f) => {
      const next = { ...f, ...patch };
      if (
        patch.agreement !== undefined ||
        patch.gst !== undefined ||
        patch.otherCharges !== undefined ||
        patch.gstOnAgreement !== undefined ||
        patch.stampDutyRegistration !== undefined
      ) {
        if (patch.totalCost === undefined) {
          next.totalCost = Math.max(
            0,
            next.agreement + next.gst + next.otherCharges + next.gstOnAgreement + next.stampDutyRegistration,
          );
        }
      }
      if (patch.totalCost !== undefined || patch.finance !== undefined) {
        if (patch.valueToBeCollected === undefined) {
          next.valueToBeCollected = Math.max(0, next.totalCost - next.finance);
        }
      }
      if (
        (patch.agreement !== undefined ||
          patch.gst !== undefined ||
          patch.otherCharges !== undefined ||
          patch.gstOnAgreement !== undefined ||
          patch.stampDutyRegistration !== undefined) &&
        patch.valueToBeCollected === undefined
      ) {
        next.valueToBeCollected = Math.max(0, next.totalCost - next.finance);
      }
      return next;
    });
  }

  useEffect(() => {
    if (installmentsTouched) return;
    setInstallments(buildDefaultInstallments(financials.valueToBeCollected));
  }, [financials.valueToBeCollected, installmentsTouched]);

  const installmentTotal = useMemo(
    () =>
      roundMoney(
        installments.reduce((s, r) => {
          const n = Number(r.amount);
          return s + (Number.isNaN(n) ? 0 : n);
        }, 0),
      ),
    [installments],
  );

  const installmentMismatch =
    financials.valueToBeCollected > 0 &&
    installments.some((r) => Number(r.amount) > 0) &&
    Math.abs(installmentTotal - financials.valueToBeCollected) > 0.5;

  const canSave = useMemo(
    () =>
      Boolean(
        projectId &&
          unitId &&
          customers[0]?.name &&
          customers[0]?.mobile &&
          financials.totalCost > 0 &&
          !installmentMismatch,
      ),
    [projectId, unitId, customers, financials.totalCost, installmentMismatch],
  );

  function updateInstallment(i: number, key: keyof InstallmentRow, value: string) {
    setInstallmentsTouched(true);
    setInstallments((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  const save = useMutation({
    mutationFn: async () => {
      const installmentPayload = installments
        .map((r, i) => ({
          name: r.name.trim() || `Installment ${i + 1}`,
          afterDays: Math.max(0, Math.round(Number(r.afterDays) || 0)),
          amount: Number(r.amount) || 0,
        }))
        .filter((r) => r.amount > 0);

      if (financials.valueToBeCollected > 0 && !installmentPayload.length) {
        throw new ApiError("Add at least one installment for value to be collected", 422);
      }
      if (
        installmentPayload.length &&
        Math.abs(
          roundMoney(installmentPayload.reduce((s, r) => s + r.amount, 0)) - financials.valueToBeCollected,
        ) > 0.5
      ) {
        throw new ApiError("Installment total must equal value to be collected", 422);
      }

      const res = await api.post<{ id: string }>("/api/bookings", {
        bookingDate,
        projectId,
        unitId,
        channelPartnerId: partnerId || null,
        status,
        customers: customers.map((c) => ({ ...c, email: c.email || null })),
        financials: {
          agreement: financials.agreement,
          gst: financials.gst,
          otherCharges: financials.otherCharges,
          totalCost: financials.totalCost,
          gstOnAgreement: financials.gstOnAgreement,
          stampDutyRegistration: financials.stampDutyRegistration,
          valueToBeCollected: financials.valueToBeCollected,
          finance: financials.finance,
        },
        installments: installmentPayload,
      });
      for (const item of pendingFiles) {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("entityType", "booking");
        fd.append("entityId", res.id);
        fd.append("projectId", projectId);
        fd.append("bookingId", res.id);
        fd.append("unitId", unitId);
        fd.append("category", item.category);
        fd.append("name", item.file.name);
        await api.upload("/api/documents", fd);
      }
      return res;
    },
    onSuccess: (res: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Booking saved · installment reminders scheduled");
      navigate(`/bookings/${res.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  return (
    <PageWrap>
      <PageHeader title="Create booking" subtitle="Single form · contact, agreement and charges" />

      <div className="mx-auto max-w-4xl space-y-3">
        <CardSoft className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Booking</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Project">
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setUnitId("");
                }}
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {(projects?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit">
              <Select
                value={unitId}
                onValueChange={(v) => {
                  setUnitId(v);
                  const u = units?.data.find((x) => x.id === v);
                  if (u?.basePrice != null) {
                    const agreement = u.basePrice ?? 0;
                    const gst = Math.round(agreement * 0.05);
                    const otherCharges = 85000;
                    const gstOnAgreement = Math.round(agreement * 0.01);
                    const stampDutyRegistration = Math.round(agreement * 0.05) + 45000;
                    const totalCost = agreement + gst + otherCharges + gstOnAgreement + stampDutyRegistration;
                    const finance = Math.round(totalCost * 0.8);
                    setFinancials({
                      agreement,
                      gst,
                      otherCharges,
                      totalCost,
                      gstOnAgreement,
                      stampDutyRegistration,
                      finance,
                      valueToBeCollected: Math.max(0, totalCost - finance),
                    });
                  }
                }}
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {(units?.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.unitNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Booking date">
              <Input className="h-10" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {selectedUnit ? (
              <p className="sm:col-span-2 text-xs text-muted-foreground">Selected {selectedUnit.unitNumber}</p>
            ) : null}
          </div>
        </CardSoft>

        <CardSoft className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact details</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCustomers((c) => [...c, { role: "co_applicant", name: "", mobile: "", email: "", pan: "" }])
              }
            >
              Add contact
            </Button>
          </div>
          {customers.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center justify-between gap-2">
                <Field label="Role">
                  <Select
                    value={c.role}
                    onValueChange={(v) =>
                      setCustomers((arr) =>
                        arr.map((x, idx) =>
                          idx === i ? { ...x, role: v as Customer["role"] } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="co_applicant">Co-applicant</SelectItem>
                      <SelectItem value="nominee">Nominee</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {customers.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setCustomers((arr) => arr.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <Field label="Name">
                <Input
                  className="h-8"
                  value={c.name}
                  onChange={(e) =>
                    setCustomers((arr) => arr.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Mobile">
                <Input
                  className="h-8"
                  value={c.mobile}
                  onChange={(e) =>
                    setCustomers((arr) => arr.map((x, idx) => (idx === i ? { ...x, mobile: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  className="h-8"
                  value={c.email}
                  onChange={(e) =>
                    setCustomers((arr) => arr.map((x, idx) => (idx === i ? { ...x, email: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="PAN">
                <Input
                  className="h-8"
                  value={c.pan}
                  onChange={(e) =>
                    setCustomers((arr) => arr.map((x, idx) => (idx === i ? { ...x, pan: e.target.value } : x)))
                  }
                />
              </Field>
            </div>
          ))}
        </CardSoft>

        <CardSoft className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financials</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MONEY_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  className="h-8"
                  type="number"
                  value={financials[k]}
                  onChange={(e) => patchFinancials({ [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <p className="text-sm">
            Total cost <span className="font-semibold tabular-nums">{inr(financials.totalCost)}</span>
            {" · "}To collect{" "}
            <span className="font-semibold tabular-nums">{inr(financials.valueToBeCollected)}</span>
            {" · "}Finance <span className="font-semibold tabular-nums">{inr(financials.finance)}</span>
          </p>
        </CardSoft>

        <CardSoft className="space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Installment break up
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Dates auto-fill from booking date + days. Totals must match value to be collected. Reminders sync to CRM.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <p>
                <span className="text-muted-foreground">Total value · </span>
                <span className="font-semibold tabular-nums">{inr(financials.totalCost)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Value to be collected · </span>
                <span className="font-semibold tabular-nums">{inr(financials.valueToBeCollected)}</span>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <div className="min-w-[36rem]">
            <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto] gap-2 border-b bg-muted/50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Installment</span>
              <span>After days</span>
              <span>Installment date</span>
              <span>Value</span>
              <span className="w-8" />
            </div>
            {installments.map((row, i) => {
              const days = Math.max(0, Math.round(Number(row.afterDays) || 0));
              const due = addDaysIso(bookingDate, days);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto] items-center gap-2 border-t px-2 py-1.5"
                >
                  <Input
                    className="h-8"
                    value={row.name}
                    onChange={(e) => updateInstallment(i, "name", e.target.value)}
                  />
                  <Input
                    className="h-8"
                    type="number"
                    min={0}
                    value={row.afterDays}
                    onChange={(e) => updateInstallment(i, "afterDays", e.target.value)}
                  />
                  <Input className="h-8 bg-muted/30" readOnly value={due ? formatDate(due) : "Auto fill"} />
                  <Input
                    className="h-8"
                    type="number"
                    min={0}
                    value={row.amount}
                    onChange={(e) => updateInstallment(i, "amount", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={installments.length <= 1}
                    onClick={() => {
                      setInstallmentsTouched(true);
                      setInstallments((rows) => rows.filter((_, idx) => idx !== i));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto] items-center gap-2 border-t bg-muted/30 px-2 py-2 text-xs font-medium">
              <span className="col-span-3 text-muted-foreground">Total</span>
              <span
                className={cn(
                  "tabular-nums font-semibold",
                  installmentMismatch ? "text-destructive" : "text-foreground",
                )}
              >
                {inr(installmentTotal)}
              </span>
              <span />
            </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className={cn(
                "text-[11px]",
                installmentMismatch ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {installmentMismatch
                ? `Total ${inr(installmentTotal)} must equal value to be collected ${inr(financials.valueToBeCollected)}`
                : `${installments.length} installment(s) · payment reminders on each due date`}
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setInstallmentsTouched(false);
                  setInstallments(buildDefaultInstallments(financials.valueToBeCollected));
                }}
              >
                Reset template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  setInstallmentsTouched(true);
                  setInstallments((rows) => [
                    ...rows,
                    {
                      name: `Installment ${rows.length + 1}`,
                      afterDays: rows.length ? String(Number(rows[rows.length - 1]?.afterDays || 0) + 15) : "10",
                      amount: "",
                    },
                  ]);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add installment
              </Button>
            </div>
          </div>
        </CardSoft>

        <CardSoft className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Partner & documents</p>
          <Field label="Channel partner">
            <Select value={partnerId || "none"} onValueChange={(v) => setPartnerId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(partners?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Active rule snapshots at save
            {activeRule?.type === "percentage"
              ? ` · ${activeRule.value}%`
              : activeRule?.type === "flat_per_unit"
                ? ` · flat ${inr(activeRule.value)}`
                : " · slab"}
            {partnerId ? ` · estimated share ${inr(partnerShare)}` : ""}
          </p>
          {projectMandate?.agreedMandateBrokerage != null ? (
            <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                Mandate brokerage {projectMandate.agreedMandateBrokerage}%
              </span>
              {projectMandate.mandateBrokeragePaymentTerm
                ? ` · ${projectMandate.mandateBrokeragePaymentTerm}`
                : ""}
              {(projectMandate.brokerageMilestones?.length ?? 0) > 0 ? (
                <span className="mt-1 block">
                  Due schedule:{" "}
                  {projectMandate.brokerageMilestones
                    .map((m) => `${m.collectionPct}% coll → ${m.brokeragePct}%`)
                    .join(" · ")}
                </span>
              ) : null}
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingFiles((arr) => [...arr, { file, category: "kyc" }]);
                e.target.value = "";
              }}
            />
            Add KYC / agreement file
          </label>
          {pendingFiles.map((item, i) => (
            <div key={item.file.name + i} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
              <span>{item.file.name}</span>
              <button
                type="button"
                className="text-muted-foreground"
                onClick={() => setPendingFiles((arr) => arr.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </CardSoft>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save booking"}
          </Button>
        </div>
      </div>
    </PageWrap>
  );
}
