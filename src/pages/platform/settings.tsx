import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { platformApi } from "@/lib/platform-api";
import { usePlatformAuthStore } from "@/stores/platform-auth";

export function PlatformSettingsPage() {
  const user = usePlatformAuthStore((s) => s.user);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () =>
      platformApi.post("/api/platform/auth/change-password", {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed"),
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Settings"
        subtitle="Your platform operator profile and security"
      />

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Signed in as</h2>
        <p className="text-sm font-medium">{user?.name}</p>
        <p className="text-xs text-muted-foreground">{user?.email}</p>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Change password</h2>
        <Field label="Current password">
          <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {newPassword && confirm && newPassword !== confirm ? (
          <p className="text-[11px] text-destructive">Passwords do not match</p>
        ) : null}
        <Button
          size="sm"
          disabled={
            change.isPending ||
            !currentPassword ||
            newPassword.length < 8 ||
            newPassword !== confirm
          }
          onClick={() => change.mutate()}
        >
          {change.isPending ? "Updating…" : "Update password"}
        </Button>
      </section>
    </div>
  );
}
