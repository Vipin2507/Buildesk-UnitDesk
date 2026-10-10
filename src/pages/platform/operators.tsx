import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import { formatDate } from "@/pages/platform/shared";
import type { OperatorRow } from "@/pages/platform/types";
import { usePlatformAuthStore } from "@/stores/platform-auth";

export function PlatformOperatorsPage() {
  const me = usePlatformAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const listQ = useQuery({
    queryKey: ["platform", "operators"],
    queryFn: () => platformApi.get<{ data: OperatorRow[] }>("/api/platform/operators"),
  });

  const create = useMutation({
    mutationFn: () =>
      platformApi.post("/api/platform/operators", { name, email, password }),
    onSuccess: () => {
      toast.success("Operator created");
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["platform", "operators"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Create failed"),
  });

  const toggle = useMutation({
    mutationFn: (row: OperatorRow) =>
      platformApi.patch(`/api/platform/operators/${row.id}`, {
        status: row.status === "active" ? "inactive" : "active",
      }),
    onSuccess: () => {
      toast.success("Operator updated");
      void qc.invalidateQueries({ queryKey: ["platform", "operators"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed"),
  });

  const rows = listQ.data?.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform operators"
        subtitle="People who can sign in to this control plane"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add operator
          </Button>
        }
      />

      {rows.length === 0 && !listQ.isLoading ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <EmptyState icon={Shield} title="No operators found" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Operator</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Created</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">
                      {row.name}
                      {me?.id === row.id ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{row.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-[11px] text-muted-foreground sm:table-cell">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={me?.id === row.id && row.status === "active"}
                      onClick={() => toggle.mutate(row)}
                    >
                      {row.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add platform operator</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name">
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                className="h-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Minimum 8 characters</p>
            </Field>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={create.isPending || !name || !email || password.length < 8}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
