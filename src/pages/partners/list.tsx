import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/field";
import { api, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  panGst: string | null;
  status: string;
  _count: { bookings: number };
};

export function PartnersListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", panGst: "", firmName: "" });
  const { data } = useQuery({
    queryKey: [...qk.partners, search],
    queryFn: () => api.get<ListResponse<Partner>>("/api/channel-partners", { search, pageSize: 50 }),
  });
  const create = useMutation({
    mutationFn: () => api.post("/api/channel-partners", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partners });
      toast.success("Partner added");
      setOpen(false);
    },
  });

  return (
    <PageWrap>
      <PageHeader
        title="Channel partners"
        subtitle="Brokers and CP firms"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add partner
          </Button>
        }
      />
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-8 pl-8" placeholder="Search partners" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <DataTable
        rows={data?.data ?? []}
        onRowClick={(row) => navigate(`/channel-partners/${row.id}`)}
        columns={[
          { key: "name", header: "Partner", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—" },
          { key: "email", header: "Email", cell: (r) => r.email ?? "—" },
          { key: "gst", header: "PAN / GST", cell: (r) => r.panGst ?? "—" },
          { key: "bk", header: "Bookings", cell: (r) => r._count.bookings },
          { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add channel partner</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Field label="Name"><Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone"><Input className="h-8" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input className="h-8" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="PAN / GST"><Input className="h-8" value={form.panGst} onChange={(e) => setForm({ ...form, panGst: e.target.value })} /></Field>
            <Button size="sm" onClick={() => create.mutate()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
