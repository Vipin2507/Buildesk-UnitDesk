import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Shield, UserRound, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { SegmentedTabs } from "@/components/shared/segmented-tabs";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";

const ACTIONS = [
  "view",
  "add",
  "edit",
  "book",
  "hold",
  "cancel",
  "payment_view",
  "payment_entry",
  "approve",
  "reports",
  "export",
] as const;

function actionLabel(action: string) {
  return action.replace(/_/g, " ");
}

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  role: { id: string; name: string };
  access: { id: string; project: { name: string }; wing: { name: string } | null }[];
};

type Role = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: { action: string }[];
  _count: { employees: number };
};

type Project = { id: string; name: string };

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  status: string;
};

type RoleForm = { name: string; permissions: string[] };

const emptyUser = (): UserForm => ({
  name: "",
  email: "",
  phone: "",
  password: "Welcome@123",
  roleId: "",
  status: "active",
});

const emptyRole = (): RoleForm => ({ name: "", permissions: ["view"] });

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

function stopRow(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

export function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<"users" | "roles" | "access">("users");
  const [userOpen, setUserOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Employee | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<UserForm>(emptyUser);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole);
  const [accessForm, setAccessForm] = useState({ employeeId: "", projectId: "" });
  const [confirm, setConfirm] = useState<{ kind: "user" | "role" | "access"; id: string; label: string } | null>(null);

  const { data: users } = useQuery({
    queryKey: qk.employees,
    queryFn: () => api.get<ListResponse<Employee>>("/api/employees", { pageSize: 100 }),
  });
  const { data: roles } = useQuery({
    queryKey: qk.roles,
    queryFn: () => api.get<ListResponse<Role>>("/api/employees/roles"),
  });
  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<Project>>("/api/projects", { pageSize: 50 }),
  });

  function openCreateUser() {
    setEditingUser(null);
    setForm(emptyUser());
    setUserOpen(true);
  }
  function openEditUser(row: Employee) {
    setEditingUser(row);
    setForm({
      name: row.name,
      email: row.email,
      phone: row.phone ?? "",
      password: "",
      roleId: row.role.id,
      status: row.status ?? "active",
    });
    setUserOpen(true);
  }
  function openCreateRole() {
    setEditingRole(null);
    setRoleForm(emptyRole());
    setRoleOpen(true);
  }
  function openEditRole(row: Role) {
    setEditingRole(row);
    setRoleForm({ name: row.name, permissions: row.permissions.map((p) => p.action) });
    setRoleOpen(true);
  }

  const saveUser = useMutation({
    mutationFn: () => {
      if (editingUser) {
        return api.patch(`/api/employees/${editingUser.id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          roleId: form.roleId,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
      }
      return api.post("/api/employees", {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
        roleId: form.roleId,
        status: form.status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.employees });
      toast.success(editingUser ? "User updated" : "User created");
      setUserOpen(false);
    },
    onError: (err) => fail(err, "Could not save user"),
  });

  const saveRole = useMutation({
    mutationFn: () =>
      editingRole
        ? api.patch(`/api/employees/roles/${editingRole.id}`, roleForm)
        : api.post("/api/employees/roles", roleForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roles });
      toast.success(editingRole ? "Role updated" : "Role created");
      setRoleOpen(false);
    },
    onError: (err) => fail(err, "Could not save role"),
  });

  const grant = useMutation({
    mutationFn: () => api.post("/api/employees/access", { ...accessForm, wingId: null, unitId: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.employees });
      toast.success("Project access granted");
      setAccessOpen(false);
      setAccessForm({ employeeId: "", projectId: "" });
    },
    onError: (err) => fail(err, "Could not grant access"),
  });

  const toggleStatus = useMutation({
    mutationFn: (row: Employee) =>
      api.patch(`/api/employees/${row.id}`, { status: row.status === "active" ? "inactive" : "active" }),
    onSuccess: (_, row) => {
      qc.invalidateQueries({ queryKey: qk.employees });
      toast.success(row.status === "active" ? "User deactivated" : "User activated");
    },
    onError: (err) => fail(err, "Could not update status"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!confirm) return;
      if (confirm.kind === "user") await api.del(`/api/employees/${confirm.id}`);
      else if (confirm.kind === "role") await api.del(`/api/employees/roles/${confirm.id}`);
      else await api.del(`/api/employees/access/${confirm.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.employees });
      qc.invalidateQueries({ queryKey: qk.roles });
      toast.success(
        confirm?.kind === "role" ? "Role deleted" : confirm?.kind === "access" ? "Access revoked" : "User deleted",
      );
      setConfirm(null);
      setUserOpen(false);
      setRoleOpen(false);
    },
    onError: (err) => fail(err, "Could not delete"),
  });

  const userValid = form.name.trim().length >= 2 && form.email.includes("@") && form.roleId && (editingUser || form.password.length >= 6);
  const roleValid = roleForm.name.trim().length >= 2 && roleForm.permissions.length > 0;

  return (
    <PageWrap>
      <PageHeader
        title="Users & roles"
        subtitle="Create, edit and remove staff, roles and project access"
        actions={
          tab === "users" ? (
            <Button size="sm" onClick={openCreateUser}><Plus className="h-3.5 w-3.5" /> Add user</Button>
          ) : tab === "roles" ? (
            <Button size="sm" onClick={openCreateRole}><Plus className="h-3.5 w-3.5" /> Add role</Button>
          ) : (
            <Button size="sm" onClick={() => setAccessOpen(true)}><Plus className="h-3.5 w-3.5" /> Grant access</Button>
          )
        }
      />
      <SegmentedTabs
        tabs={[
          { id: "users", label: "Users" },
          { id: "roles", label: "Roles" },
          { id: "access", label: "Project access" },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === "users" && (
          <DataTable
            rows={users?.data ?? []}
            onRowClick={openEditUser}
            empty={<EmptyState icon={UserRound} title="No users yet." actionLabel="Add user" onAction={openCreateUser} />}
            columns={[
              { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: "email", header: "Email", cell: (r) => r.email },
              { key: "phone", header: "Phone", cell: (r) => r.phone || "—", hideOnMobile: true },
              { key: "role", header: "Role", cell: (r) => r.role.name },
              { key: "access", header: "Projects", cell: (r) => r.access.length },
              { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
              {
                key: "actions",
                header: "",
                hideOnMobile: true,
                className: "w-10",
                cell: (r) => (
                  <div onClick={stopRow} onPointerDown={stopRow}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditUser(r)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={r.id === me?.id}
                          onSelect={() => toggleStatus.mutate(r)}
                        >
                          {r.status === "active" ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={r.id === me?.id}
                          onSelect={() => setConfirm({ kind: "user", id: r.id, label: r.name })}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ),
              },
            ]}
          />
        )}
        {tab === "roles" && (
          <DataTable
            rows={roles?.data ?? []}
            onRowClick={openEditRole}
            empty={<EmptyState icon={Shield} title="No roles yet." actionLabel="Add role" onAction={openCreateRole} />}
            columns={[
              { key: "name", header: "Role", cell: (r) => (
                <span className="font-medium">
                  {r.name}
                  {r.isSystem ? <span className="ml-1.5 text-[10px] font-medium uppercase text-muted-foreground">System</span> : null}
                </span>
              ) },
              { key: "perms", header: "Permissions", cell: (r) => r.permissions.map((p) => actionLabel(p.action)).join(", ") },
              { key: "n", header: "Users", cell: (r) => r._count.employees },
              {
                key: "actions",
                header: "",
                hideOnMobile: true,
                className: "w-10",
                cell: (r) => (
                  <div onClick={stopRow} onPointerDown={stopRow}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditRole(r)}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={r.isSystem || r._count.employees > 0}
                          onSelect={() => setConfirm({ kind: "role", id: r.id, label: r.name })}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ),
              },
            ]}
          />
        )}
        {tab === "access" && (
          <DataTable
            rows={(users?.data ?? []).flatMap((u) =>
              u.access.map((a) => ({
                id: a.id,
                user: u.name,
                project: a.project.name,
                wing: a.wing?.name ?? "All wings",
              })),
            )}
            empty={<EmptyState icon={KeyRound} title="No project access granted yet." actionLabel="Grant access" onAction={() => setAccessOpen(true)} />}
            columns={[
              { key: "user", header: "Employee", cell: (r) => r.user },
              { key: "project", header: "Project", cell: (r) => r.project },
              { key: "wing", header: "Scope", cell: (r) => r.wing },
              {
                key: "actions",
                header: "",
                className: "w-24 text-right",
                cell: (r) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setConfirm({ kind: "access", id: r.id, label: `${r.user} · ${r.project}` })}
                  >
                    Revoke
                  </Button>
                ),
              },
            ]}
          />
        )}
      </SegmentedTabs>

      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Update profile, role or password." : "Staff sign in with this email and password."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Field label="Name">
              <Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input className="h-8" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input className="h-8" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={editingUser ? "New password (optional)" : "Password"}>
              <Input className="h-8" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {(roles?.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="mt-1 flex items-center justify-between gap-2">
              {editingUser && editingUser.id !== me?.id ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirm({ kind: "user", id: editingUser.id, label: editingUser.name })}
                >
                  Delete user
                </Button>
              ) : <span />}
              <Button size="sm" disabled={!userValid || saveUser.isPending} onClick={() => saveUser.mutate()}>
                {saveUser.isPending ? "Saving…" : editingUser ? "Save changes" : "Create user"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit role" : "Add role"}</DialogTitle>
            <DialogDescription>Permissions control what staff can do across the desk.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              className="h-8"
              value={roleForm.name}
              disabled={editingRole?.isSystem}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-xs capitalize">
                <Checkbox
                  checked={roleForm.permissions.includes(a)}
                  onCheckedChange={(v) =>
                    setRoleForm((f) => ({
                      ...f,
                      permissions: v ? [...f.permissions, a] : f.permissions.filter((x) => x !== a),
                    }))
                  }
                />
                {actionLabel(a)}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            {editingRole && !editingRole.isSystem && editingRole._count.employees === 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirm({ kind: "role", id: editingRole.id, label: editingRole.name })}
              >
                Delete role
              </Button>
            ) : <span />}
            <Button size="sm" disabled={!roleValid || saveRole.isPending} onClick={() => saveRole.mutate()}>
              {saveRole.isPending ? "Saving…" : editingRole ? "Save changes" : "Create role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant project access</DialogTitle>
            <DialogDescription>Leaving wing empty grants the whole project.</DialogDescription>
          </DialogHeader>
          <Field label="Employee">
            <Select value={accessForm.employeeId} onValueChange={(v) => setAccessForm({ ...accessForm, employeeId: v })}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {(users?.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Project">
            <Select value={accessForm.projectId} onValueChange={(v) => setAccessForm({ ...accessForm, projectId: v })}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {(projects?.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!accessForm.employeeId || !accessForm.projectId || grant.isPending}
              onClick={() => grant.mutate()}
            >
              {grant.isPending ? "Granting…" : "Grant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "access" ? "Revoke access?" : confirm?.kind === "role" ? "Delete role?" : "Delete user?"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "access"
                ? `Remove project access for ${confirm.label}. They will lose this project immediately.`
                : confirm?.kind === "role"
                  ? `Delete “${confirm.label}”. This cannot be undone.`
                  : `Delete ${confirm?.label}. Bookings they created stay in place.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Working…" : confirm?.kind === "access" ? "Revoke" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
