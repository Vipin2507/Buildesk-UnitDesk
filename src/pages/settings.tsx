import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useThemeStore } from "@/stores/theme";

type Settings = Record<string, string>;

export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<Settings>("/api/settings"),
  });
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgEmail, setOrgEmail] = useState<string | null>(null);
  const name = orgName ?? data?.orgName ?? "";
  const email = orgEmail ?? data?.orgEmail ?? "";
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => api.patch("/api/settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      toast.success("Settings saved");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed"),
  });

  return (
    <PageWrap>
      <PageHeader title="Settings" subtitle="Workspace preferences" />
      <CardSoft className="max-w-lg space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Dark theme</p>
            <p className="text-xs text-muted-foreground">Navy-black canvas, 700ms crossfade</p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
        <Field label="Organisation name">
          <Input className="h-8" value={name} onChange={(e) => setOrgName(e.target.value)} />
        </Field>
        <Field label="Organisation email">
          <Input className="h-8" value={email} onChange={(e) => setOrgEmail(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Approval for cancel</p>
            <p className="text-xs text-muted-foreground">Non-admins send booking cancel for approval</p>
          </div>
          <Switch
            checked={data?.requireApprovalForCancel === "true"}
            onCheckedChange={(v) => save.mutate({ requireApprovalForCancel: v ? "true" : "false" })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Approval for confirm</p>
            <p className="text-xs text-muted-foreground">Non-admins send booking confirm for approval</p>
          </div>
          <Switch
            checked={data?.requireApprovalForConfirm === "true"}
            onCheckedChange={(v) => save.mutate({ requireApprovalForConfirm: v ? "true" : "false" })}
          />
        </div>
        <Button size="sm" onClick={() => save.mutate({ orgName: name, orgEmail: email })} disabled={save.isPending}>
          Save organisation
        </Button>
      </CardSoft>
    </PageWrap>
  );
}
