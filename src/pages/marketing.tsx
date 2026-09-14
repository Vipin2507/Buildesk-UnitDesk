import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  project: { name: string } | null;
};

type Campaign = {
  id: string;
  name: string;
  channel: string;
  audience: string;
  status: string;
  sentCount: number;
  message: string;
};

export function MarketingPage() {
  const qc = useQueryClient();
  const projectId = useProjectContextStore((s) => s.projectId);
  const [lead, setLead] = useState({ name: "", phone: "", email: "", source: "website" });
  const [campaign, setCampaign] = useState({
    name: "",
    channel: "whatsapp",
    audience: "leads",
    message: "",
  });

  const { data: leads } = useQuery({
    queryKey: qk.leads({ projectId }),
    queryFn: () => api.get<ListResponse<Lead>>("/api/marketing/leads", { projectId, pageSize: 50 }),
  });
  const { data: campaigns } = useQuery({
    queryKey: qk.campaigns({ projectId }),
    queryFn: () => api.get<ListResponse<Campaign>>("/api/marketing/campaigns", { projectId, pageSize: 50 }),
  });

  const addLead = useMutation({
    mutationFn: () => api.post("/api/marketing/leads", { ...lead, projectId: projectId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead captured");
      setLead({ name: "", phone: "", email: "", source: "website" });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });
  const addCampaign = useMutation({
    mutationFn: () => api.post("/api/marketing/campaigns", { ...campaign, projectId: projectId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign saved");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });
  const send = useMutation({
    mutationFn: (id: string) => api.post(`/api/marketing/campaigns/${id}/send`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign sent");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Send failed"),
  });

  return (
    <PageWrap>
      <PageHeader title="Marketing" subtitle="Leads and outbound campaigns" />
      <div className="grid gap-2 lg:grid-cols-2">
        <CardSoft className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capture lead</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Name">
              <Input className="h-8" value={lead.name} onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input className="h-8" value={lead.phone} onChange={(e) => setLead((l) => ({ ...l, phone: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input className="h-8" value={lead.email} onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))} />
            </Field>
            <Field label="Source">
              <Select value={lead.source} onValueChange={(v) => setLead((l) => ({ ...l, source: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["website", "walkin", "partner", "referral"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Button size="sm" disabled={!lead.name || addLead.isPending} onClick={() => addLead.mutate()}>Save lead</Button>
        </CardSoft>
        <CardSoft className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New campaign</p>
          <Field label="Name">
            <Input className="h-8" value={campaign.name} onChange={(e) => setCampaign((c) => ({ ...c, name: e.target.value }))} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Channel">
              <Select value={campaign.channel} onValueChange={(v) => setCampaign((c) => ({ ...c, channel: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["whatsapp", "sms", "email"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={campaign.audience} onValueChange={(v) => setCampaign((c) => ({ ...c, audience: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["leads", "customers", "partners"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Message">
            <Textarea value={campaign.message} onChange={(e) => setCampaign((c) => ({ ...c, message: e.target.value }))} />
          </Field>
          <Button size="sm" disabled={!campaign.name || !campaign.message || addCampaign.isPending} onClick={() => addCampaign.mutate()}>
            Save campaign
          </Button>
        </CardSoft>
      </div>
      <CardSoft padded={false} className="p-0">
        <div className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leads</p></div>
        <DataTable
          rows={leads?.data ?? []}
          columns={[
            { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: "ph", header: "Phone", cell: (r) => r.phone ?? "—" },
            { key: "src", header: "Source", cell: (r) => r.source ?? "—" },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            { key: "pr", header: "Project", cell: (r) => r.project?.name ?? "—" },
          ]}
        />
      </CardSoft>
      <CardSoft padded={false} className="p-0">
        <div className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campaigns</p></div>
        <DataTable
          rows={campaigns?.data ?? []}
          columns={[
            { key: "name", header: "Name", cell: (r) => r.name },
            { key: "ch", header: "Channel", cell: (r) => r.channel },
            { key: "aud", header: "Audience", cell: (r) => r.audience },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
            { key: "n", header: "Sent", cell: (r) => r.sentCount },
            {
              key: "act",
              header: "",
              cell: (r) =>
                r.status !== "sent" ? (
                  <Button size="sm" variant="outline" onClick={() => send.mutate(r.id)}>Send</Button>
                ) : null,
            },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
