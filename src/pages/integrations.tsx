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
import { Switch } from "@/components/ui/switch";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

type Integration = {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  config: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
};

type Log = {
  id: string;
  provider: string;
  toAddress: string;
  subject: string | null;
  status: string;
  createdAt: string;
};

export function IntegrationsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.integrations,
    queryFn: () => api.get<{ data: Integration[]; logs: Log[] }>("/api/integrations"),
  });
  const [drafts, setDrafts] = useState<Record<string, { apiKey: string; from: string; url: string }>>({});
  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("Hello from UnitDesk");

  const save = useMutation({
    mutationFn: (row: Integration) => {
      const d = drafts[row.id] ?? JSON.parse(row.config || "{}");
      return api.patch(`/api/integrations/${row.id}`, {
        enabled: row.enabled,
        config: { apiKey: d.apiKey ?? "", from: d.from ?? "", url: d.url ?? "" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.integrations });
      toast.success("Integration saved");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });
  const toggle = useMutation({
    mutationFn: (row: Integration) => api.patch(`/api/integrations/${row.id}`, { enabled: !row.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations }),
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; message: string }>(`/api/integrations/${id}/test`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.integrations });
      toast[res.ok ? "success" : "error"](res.message);
    },
  });
  const send = useMutation({
    mutationFn: (id: string) => api.post(`/api/integrations/${id}/send`, { to: sendTo, body: sendBody, subject: "UnitDesk" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.integrations });
      toast.success("Queued to message log");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Send failed"),
  });

  return (
    <PageWrap>
      <PageHeader title="Integrations" subtitle="WhatsApp, SMS, email and outbound webhook" />
      <div className="grid gap-2 lg:grid-cols-2">
        {(data?.data ?? []).map((row) => {
          const cfg = { ...JSON.parse(row.config || "{}"), ...drafts[row.id] };
          return (
            <CardSoft key={row.id} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">{row.provider}</p>
                </div>
                <Switch checked={row.enabled} onCheckedChange={() => toggle.mutate(row)} />
              </div>
              <Field label={row.provider === "webhook" ? "URL" : "From / sender"}>
                <Input
                  className="h-8"
                  value={row.provider === "webhook" ? (cfg.url ?? "") : (cfg.from ?? "")}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [row.id]: {
                        apiKey: cfg.apiKey ?? "",
                        from: row.provider === "webhook" ? (cfg.from ?? "") : e.target.value,
                        url: row.provider === "webhook" ? e.target.value : (cfg.url ?? ""),
                      },
                    }))
                  }
                />
              </Field>
              <Field label="API key">
                <Input
                  className="h-8"
                  type="password"
                  value={cfg.apiKey ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [row.id]: { apiKey: e.target.value, from: cfg.from ?? "", url: cfg.url ?? "" },
                    }))
                  }
                />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Last test {formatDate(row.lastTestAt)} {row.lastTestOk == null ? "" : row.lastTestOk ? "· ok" : "· failed"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => save.mutate({ ...row })}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => test.mutate(row.id)}>Test</Button>
              </div>
            </CardSoft>
          );
        })}
      </div>
      <CardSoft className="max-w-xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send test message</p>
        <Field label="To">
          <Input className="h-8" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="phone or email" />
        </Field>
        <Field label="Body">
          <Input className="h-8" value={sendBody} onChange={(e) => setSendBody(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {(data?.data ?? []).map((row) => (
            <Button key={row.id} size="sm" variant="outline" disabled={!sendTo} onClick={() => send.mutate(row.id)}>
              Send via {row.provider}
            </Button>
          ))}
        </div>
      </CardSoft>
      <CardSoft padded={false} className="p-0">
        <div className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Message log</p></div>
        <DataTable
          rows={data?.logs ?? []}
          columns={[
            { key: "t", header: "When", cell: (r) => formatDate(r.createdAt) },
            { key: "p", header: "Provider", cell: (r) => r.provider },
            { key: "to", header: "To", cell: (r) => r.toAddress },
            { key: "s", header: "Subject", cell: (r) => r.subject ?? "—" },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      </CardSoft>
    </PageWrap>
  );
}
