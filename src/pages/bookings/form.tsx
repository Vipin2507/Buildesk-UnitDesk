import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/cn";
import { inr } from "@/lib/format";

const STEPS = [
  { id: 0, label: "Booking" },
  { id: 1, label: "Customer" },
  { id: 2, label: "Financials" },
  { id: 3, label: "Partner" },
  { id: 4, label: "Documents" },
];

type Customer = {
  role: "primary" | "co_applicant" | "nominee";
  name: string;
  mobile: string;
  email: string;
  pan: string;
};

export function BookingFormPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState(params.get("projectId") ?? "");
  const [unitId, setUnitId] = useState(params.get("unitId") ?? "");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("booked");
  const [customers, setCustomers] = useState<Customer[]>([
    { role: "primary", name: "", mobile: "", email: "", pan: "" },
  ]);
  const [financials, setFinancials] = useState({
    totalDealValue: 0,
    dealValueWithoutGst: 0,
    gst: 0,
    discount: 0,
    receivedPayment: 0,
    pendingAmount: 0,
  });
  const [pendingFiles, setPendingFiles] = useState<{ file: File; category: string }[]>([]);
  const [partnerId, setPartnerId] = useState("");

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

  const selectedUnit = units?.data.find((u) => u.id === unitId);
  const activeRule = rules?.data.find((r) => r.active);
  const partnerShare =
    activeRule?.type === "percentage"
      ? (financials.totalDealValue * (activeRule.value ?? 0)) / 100
      : activeRule?.type === "flat_per_unit"
        ? (activeRule.value ?? 0)
        : 0;

  function patchFinancials(patch: Partial<typeof financials>) {
    setFinancials((f) => {
      const next = { ...f, ...patch };
      if (patch.totalDealValue !== undefined || patch.receivedPayment !== undefined) {
        next.pendingAmount = Math.max(0, next.totalDealValue - next.receivedPayment);
      }
      if (patch.dealValueWithoutGst !== undefined || patch.gst !== undefined || patch.discount !== undefined) {
        if (patch.totalDealValue === undefined) {
          next.totalDealValue = Math.max(0, next.dealValueWithoutGst + next.gst - next.discount);
          next.pendingAmount = Math.max(0, next.totalDealValue - next.receivedPayment);
        }
      }
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ id: string }>("/api/bookings", {
        bookingDate,
        projectId,
        unitId,
        channelPartnerId: partnerId || null,
        status,
        customers: customers.map((c) => ({ ...c, email: c.email || null })),
        financials: {
          totalDealValue: financials.totalDealValue,
          dealValueWithoutGst: financials.dealValueWithoutGst,
          gst: financials.gst,
          discount: financials.discount,
          receivedPayment: financials.receivedPayment,
          pendingAmount: financials.pendingAmount,
        },
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
      toast.success("Booking saved");
      navigate(`/bookings/${res.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  const canNext = useMemo(() => {
    if (step === 0) return projectId && unitId;
    if (step === 1) return customers[0]?.name && customers[0]?.mobile;
    if (step === 2) return financials.totalDealValue > 0;
    return true;
  }, [step, projectId, unitId, customers, financials.totalDealValue]);

  return (
    <PageWrap>
      <PageHeader title="Create booking" subtitle="Booking → customer → financials → partner share" />
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              step === s.id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-card/20 text-[10px]">{s.id + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      <CardSoft className="max-w-3xl space-y-2.5">
        {step === 0 && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Project">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {(projects?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={unitId} onValueChange={(v) => {
                setUnitId(v);
                const u = units?.data.find((x) => x.id === v);
                if (u?.basePrice != null) {
                  const base = u.basePrice ?? 0;
                  const gst = Math.round(base * 0.05);
                  const discount = 0;
                  const dealWithoutGst = base;
                  const total = Math.max(0, dealWithoutGst + gst - discount);
                  const received = Math.round(total * 0.1);
                  setFinancials({
                    dealValueWithoutGst: dealWithoutGst,
                    gst,
                    discount,
                    totalDealValue: total,
                    receivedPayment: received,
                    pendingAmount: Math.max(0, total - received),
                  });
                }
              }}>
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
            {selectedUnit ? <p className="sm:col-span-2 text-xs text-muted-foreground">Selected {selectedUnit.unitNumber}</p> : null}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            {customers.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  {c.role.replace("_", " ")}
                </p>
                <Field label="Name">
                  <Input className="h-8" value={c.name} onChange={(e) => setCustomers((arr) => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                </Field>
                <Field label="Mobile">
                  <Input className="h-8" value={c.mobile} onChange={(e) => setCustomers((arr) => arr.map((x, idx) => idx === i ? { ...x, mobile: e.target.value } : x))} />
                </Field>
                <Field label="Email">
                  <Input className="h-8" value={c.email} onChange={(e) => setCustomers((arr) => arr.map((x, idx) => idx === i ? { ...x, email: e.target.value } : x))} />
                </Field>
                <Field label="PAN">
                  <Input className="h-8" value={c.pan} onChange={(e) => setCustomers((arr) => arr.map((x, idx) => idx === i ? { ...x, pan: e.target.value } : x))} />
                </Field>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCustomers((c) => [...c, { role: "co_applicant", name: "", mobile: "", email: "", pan: "" }])}
            >
              Add customer
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                ["totalDealValue", "Total deal value"],
                ["dealValueWithoutGst", "Deal value without GST"],
                ["gst", "GST"],
                ["discount", "Discount"],
                ["receivedPayment", "Received payment"],
                ["pendingAmount", "Pending amount"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  className="h-8"
                  type="number"
                  value={financials[k]}
                  onChange={(e) => patchFinancials({ [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
            <p className="sm:col-span-2 text-sm">
              Total deal <span className="font-semibold tabular-nums">{inr(financials.totalDealValue)}</span>
              {" · "}Pending <span className="font-semibold tabular-nums">{inr(financials.pendingAmount)}</span>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2.5">
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
              Active rule snapshots at save time
              {activeRule?.type === "percentage" ? ` · ${activeRule.value}%` : activeRule?.type === "flat_per_unit" ? ` · flat ${inr(activeRule.value)}` : " · slab"}
              {partnerId ? ` · estimated share ${inr(partnerShare)}` : ""}
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Attach KYC now; files upload when the booking is saved.
            </p>
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
                <button type="button" className="text-muted-foreground" onClick={() => setPendingFiles((arr) => arr.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-1">
          <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Previous
          </Button>
          {step < 4 ? (
            <Button type="button" size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              Save booking
            </Button>
          )}
        </div>
      </CardSoft>
    </PageWrap>
  );
}
