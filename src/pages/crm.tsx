import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { DataTable } from "@/components/shared/data-table";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Reminder = {
  id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  status: string;
  dueAt: string;
  booking: { id: string; bookingNumber: string; unit: { unitNumber: string } } | null;
};

export function CrmPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "follow_up",
    channel: "email",
    dueAt: new Date().toISOString().slice(0, 10),
  });
  const { data } = useQuery({
    queryKey: qk.reminders({ projectId }),
    queryFn: () => api.get<ListResponse<Reminder>>("/api/reminders", { projectId, pageSize: 50 }),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/reminders", {
        ...form,
        projectId: projectId || null,
        dueAt: new Date(form.dueAt).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Reminder scheduled");
      setForm((f) => ({ ...f, title: "", message: "" }));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });
  const send = useMutation({
    mutationFn: (id: string) => api.post(`/api/reminders/${id}/send`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Dispatched via configured channel");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Send failed"),
  });

  return (
    <PageWrap>
      <PageHeader
        title="CRM activities"
        subtitle="Payment, KYC and follow-up reminders"
        breadcrumbs={projectId ? [{ label: "Project", to: `/projects/${projectId}` }, { label: "CRM" }] : undefined}
      />
      <CardSoft className="max-w-2xl space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New reminder</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Title">
            <Input className="h-8" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Due">
            <Input className="h-8" type="date" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["follow_up", "kyc_pending", "payment_due", "site_visit"].map((t) => (
                  <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["email", "sms", "whatsapp", "in_app"].map((t) => (
                  <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Message">
              <Textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </Field>
          </div>
        </div>
        <Button size="sm" disabled={!form.title || !form.message || create.isPending} onClick={() => create.mutate()}>
          Schedule
        </Button>
      </CardSoft>
      <CardSoft padded={false}>
        <DataTable
          rows={data?.data ?? []}
          onRowClick={(row) => row.booking && navigate(`/bookings/${row.booking.id}`)}
          columns={[
            { key: "due", header: "Due", cell: (r) => formatDate(r.dueAt) },
            { key: "title", header: "Title", cell: (r) => r.title },
            { key: "bk", header: "Booking", cell: (r) => r.booking?.bookingNumber ?? "—" },
            { key: "ch", header: "Channel", cell: (r) => r.channel },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            {
              key: "act",
              header: "",
              cell: (r) =>
                r.status !== "sent" ? (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); send.mutate(r.id); }}>
                    Send
                  </Button>
                ) : null,
            },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
