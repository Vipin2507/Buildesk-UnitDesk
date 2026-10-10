import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  UserRound,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { PasswordInput } from "@/components/shared/password-input";
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
import { cn } from "@/lib/cn";
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

const LIVE_MS = 4_000;

function actionLabel(action: string) {
  return action.replace(/_/g, " ");
}

type AccessRow = {
  id: string;
  projectId: string;
  wingId: string | null;
  unitId: string | null;
  scope?: "project" | "wing" | "unit";
  project: { id: string; name: string };
  wing: { id: string; name: string } | null;
  unit: {
    id: string;
    unitNumber: string;
    floor?: { number: number; wing?: { name: string } };
  } | null;
  employee?: { id: string; name: string; email: string };
};

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  role: { id: string; name: string };
  access: AccessRow[];
};

type Role = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: { action: string }[];
  _count: { employees: number };
};

type Project = { id: string; name: string };
type Wing = { id: string; name: string };
type UnitOption = {
  id: string;
  unitNumber: string;
  floor: { number: number; wing: { id: string; name: string } };
};

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  status: string;
};

type RoleForm = { name: string; permissions: string[] };

type AccessForm = {
  employeeId: string;
  projectId: string;
  scope: "project" | "wing" | "unit";
  wingId: string;
  unitId: string;
};

type Summary = {
  total: number;
  active: number;
  inactive: number;
  roles: number;
  withAccess: number;
};

const emptyUser = (): UserForm => ({
  name: "",
  email: "",
  phone: "",
  password: "Welcome@123",
  roleId: "",
  status: "active",
});

const emptyRole = (): RoleForm => ({ name: "", permissions: ["view"] });

const emptyAccess = (): AccessForm => ({
  employeeId: "",
  projectId: "",
  scope: "project",
  wingId: "",
  unitId: "",
});

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

function stopRow(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function scopeBadge(row: AccessRow) {
  if (row.unitId || row.scope === "unit") return "Unit";
  if (row.wingId || row.scope === "wing") return "Wing";
  return "Project";
}

function scopeDetail(row: AccessRow) {
  if (row.unit) {
    return `${row.unit.unitNumber}${row.unit.floor ? ` · L${row.unit.floor.number}` : ""}${
      row.wing?.name || row.unit.floor?.wing?.name
        ? ` · ${row.wing?.name ?? row.unit.floor?.wing?.name}`
        : ""
    }`;
  }
  if (row.wing) return `Wing ${row.wing.name}`;
  return "Entire project";
}

function invalidateStaff(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["employees"] });
  qc.invalidateQueries({ queryKey: qk.employeesSummary });
  qc.invalidateQueries({ queryKey: ["access"] });
  qc.invalidateQueries({ queryKey: qk.projects() });
  qc.invalidateQueries({ queryKey: qk.me });
}

export function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<"users" | "roles" | "access">("users");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accessEmployeeFilter, setAccessEmployeeFilter] = useState("all");
  const [accessProjectFilter, setAccessProjectFilter] = useState("all");
  const [accessScopeFilter, setAccessScopeFilter] = useState("all");
  const [userOpen, setUserOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Employee | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<UserForm>(emptyUser);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole);
  const [accessForm, setAccessForm] = useState<AccessForm>(emptyAccess);
  const [confirm, setConfirm] = useState<{ kind: "user" | "role" | "access"; id: string; label: string } | null>(
    null,
  );
  const [live, setLive] = useState(true);
  const [lastSync, setLastSync] = useState(() => new Date());

  const listParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      roleId: roleFilter === "all" ? undefined : roleFilter,
      pageSize: 100,
    }),
    [search, statusFilter, roleFilter],
  );

  const accessParams = useMemo(
    () => ({
      employeeId: accessEmployeeFilter === "all" ? undefined : accessEmployeeFilter,
      projectId: accessProjectFilter === "all" ? undefined : accessProjectFilter,
    }),
    [accessEmployeeFilter, accessProjectFilter],
  );

  const { data: summary } = useQuery({
    queryKey: qk.employeesSummary,
    queryFn: () => api.get<Summary>("/api/employees/summary"),
    refetchInterval: live ? LIVE_MS : false,
  });

  const { data: users, dataUpdatedAt: usersAt } = useQuery({
    queryKey: qk.employeesList(listParams),
    queryFn: () => api.get<ListResponse<Employee>>("/api/employees", listParams),
    refetchInterval: live ? LIVE_MS : false,
  });

  const { data: roles } = useQuery({
    queryKey: qk.roles,
    queryFn: () => api.get<ListResponse<Role>>("/api/employees/roles"),
    refetchInterval: live ? LIVE_MS : false,
  });

  const { data: projects } = useQuery({
    queryKey: qk.projects(),
    queryFn: () => api.get<ListResponse<Project>>("/api/projects", { pageSize: 100 }),
  });

  const { data: allUsers } = useQuery({
    queryKey: qk.employees,
    queryFn: () => api.get<ListResponse<Employee>>("/api/employees", { pageSize: 100 }),
    enabled: tab === "access" || accessOpen,
    refetchInterval: live && tab === "access" ? LIVE_MS : false,
  });

  const { data: accessList, dataUpdatedAt: accessAt } = useQuery({
    queryKey: qk.accessList(accessParams),
    queryFn: () => api.get<ListResponse<AccessRow>>("/api/employees/access", accessParams),
    enabled: tab === "access",
    refetchInterval: live ? LIVE_MS : false,
  });

  const { data: projectDetail } = useQuery({
    queryKey: qk.project(accessForm.projectId),
    queryFn: () =>
      api.get<{ id: string; wings: Wing[] }>(`/api/projects/${accessForm.projectId}`),
    enabled: Boolean(accessForm.projectId) && accessOpen,
  });

  const { data: units } = useQuery({
    queryKey: qk.units(accessForm.projectId, { wingId: accessForm.wingId || "all" }),
    queryFn: () =>
      api.get<ListResponse<UnitOption>>(`/api/projects/${accessForm.projectId}/units`, {
        pageSize: 500,
        wingId: accessForm.wingId || undefined,
      }),
    enabled: accessOpen && accessForm.scope === "unit" && Boolean(accessForm.projectId),
  });

  useEffect(() => {
    if (usersAt || accessAt) setLastSync(new Date());
  }, [usersAt, accessAt]);

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
  function openGrantAccess(employeeId?: string) {
    setAccessForm({
      ...emptyAccess(),
      employeeId: employeeId ?? "",
    });
    setAccessOpen(true);
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
      invalidateStaff(qc);
      qc.invalidateQueries({ queryKey: qk.roles });
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
      invalidateStaff(qc);
      toast.success(editingRole ? "Role updated — permissions apply on next request" : "Role created");
      setRoleOpen(false);
    },
    onError: (err) => fail(err, "Could not save role"),
  });

  const grant = useMutation({
    mutationFn: () =>
      api.post("/api/employees/access", {
        employeeId: accessForm.employeeId,
        projectId: accessForm.projectId,
        wingId: accessForm.scope === "project" ? null : accessForm.wingId || null,
        unitId: accessForm.scope === "unit" ? accessForm.unitId || null : null,
        replaceNarrower: accessForm.scope === "project",
      }),
    onSuccess: () => {
      invalidateStaff(qc);
      toast.success(
        accessForm.employeeId === me?.id
          ? "Access granted — your workspace updates immediately"
          : "Access granted · live for that user now",
      );
      setAccessOpen(false);
      setAccessForm(emptyAccess());
    },
    onError: (err) => fail(err, "Could not grant access"),
  });

  const grantAllProjects = useMutation({
    mutationFn: async (employeeId: string) => {
      const grants = (projects?.data ?? []).map((p) => ({
        projectId: p.id,
        wingId: null,
        unitId: null,
      }));
      if (!grants.length) throw new Error("No projects available");
      return api.post("/api/employees/access/bulk", { employeeId, grants });
    },
    onSuccess: () => {
      invalidateStaff(qc);
      toast.success("Full project access granted");
    },
    onError: (err) => fail(err, "Could not grant all projects"),
  });

  const toggleStatus = useMutation({
    mutationFn: (row: Employee) =>
      api.patch(`/api/employees/${row.id}`, { status: row.status === "active" ? "inactive" : "active" }),
    onSuccess: (_, row) => {
      invalidateStaff(qc);
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
      invalidateStaff(qc);
      qc.invalidateQueries({ queryKey: qk.roles });
      toast.success(
        confirm?.kind === "role"
          ? "Role deleted"
          : confirm?.kind === "access"
            ? "Access revoked · applies immediately"
            : "User deleted",
      );
      setConfirm(null);
      setUserOpen(false);
      setRoleOpen(false);
    },
    onError: (err) => fail(err, "Could not delete"),
  });

  const accessRows = useMemo(() => {
    let rows = accessList?.data ?? [];
    if (accessScopeFilter === "project") rows = rows.filter((r) => !r.wingId && !r.unitId);
    if (accessScopeFilter === "wing") rows = rows.filter((r) => r.wingId && !r.unitId);
    if (accessScopeFilter === "unit") rows = rows.filter((r) => Boolean(r.unitId));
    return rows.map((r) => ({
      ...r,
      userName: r.employee?.name ?? allUsers?.data?.find((u) => u.access.some((a) => a.id === r.id))?.name ?? "—",
      userEmail: r.employee?.email ?? "",
    }));
  }, [accessList?.data, accessScopeFilter, allUsers?.data]);

  const userValid =
    form.name.trim().length >= 2 && form.email.includes("@") && form.roleId && (editingUser || form.password.length >= 6);
  const roleValid = roleForm.name.trim().length >= 2 && roleForm.permissions.length > 0;
  const accessValid =
    Boolean(accessForm.employeeId && accessForm.projectId) &&
    (accessForm.scope === "project" ||
      (accessForm.scope === "wing" && accessForm.wingId) ||
      (accessForm.scope === "unit" && accessForm.unitId));

  return (
    <PageWrap>
      <PageHeader
        title="Users & roles"
        subtitle="Staff accounts, permissions and minute-level project · wing · unit access"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={live ? "secondary" : "outline"}
              onClick={() => setLive((v) => !v)}
              title={live ? "Live sync on" : "Live sync paused"}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", live && "animate-spin [animation-duration:3s]")} />
              {live ? "Live" : "Paused"}
            </Button>
            {tab === "users" ? (
              <Button size="sm" onClick={openCreateUser}>
                <Plus className="h-3.5 w-3.5" /> Add user
              </Button>
            ) : tab === "roles" ? (
              <Button size="sm" onClick={openCreateRole}>
                <Plus className="h-3.5 w-3.5" /> Add role
              </Button>
            ) : (
              <Button size="sm" onClick={() => openGrantAccess()}>
                <Plus className="h-3.5 w-3.5" /> Grant access
              </Button>
            )}
          </div>
        }
      />

      <p className="text-[11px] text-muted-foreground">
        Synced {lastSync.toLocaleTimeString("en-IN")}
        {live ? " · polling every 4s" : " · live sync paused"} · access changes apply on the next API request
      </p>

      {tab === "users" || tab === "access" ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiCard
            label="Users"
            value={summary?.total ?? 0}
            icon={Users}
            active={tab === "users" && statusFilter === "all"}
            onClick={() => {
              setTab("users");
              setStatusFilter("all");
            }}
          />
          <KpiCard
            label="Active"
            value={summary?.active ?? 0}
            icon={UserCheck}
            tone="success"
            active={tab === "users" && statusFilter === "active"}
            onClick={() => {
              setTab("users");
              setStatusFilter("active");
            }}
          />
          <KpiCard
            label="With access"
            value={summary?.withAccess ?? 0}
            icon={KeyRound}
            active={tab === "access"}
            onClick={() => setTab("access")}
            hint="Project scopes"
          />
          <KpiCard
            label="Roles"
            value={summary?.roles ?? 0}
            icon={Shield}
            onClick={() => setTab("roles")}
          />
        </div>
      ) : null}

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
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8"
                  placeholder="Search name, email, phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {(roles?.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DataTable
              rows={users?.data ?? []}
              onRowClick={openEditUser}
              empty={<EmptyState icon={UserRound} title="No users yet." actionLabel="Add user" onAction={openCreateUser} />}
              columns={[
                { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "email", header: "Email", cell: (r) => r.email },
                { key: "phone", header: "Phone", cell: (r) => r.phone || "—", hideOnMobile: true },
                { key: "role", header: "Role", cell: (r) => r.role.name },
                {
                  key: "access",
                  header: "Access",
                  cell: (r) => {
                    const projectsN = new Set(r.access.map((a) => a.projectId)).size;
                    const wings = r.access.filter((a) => a.wingId && !a.unitId).length;
                    const units = r.access.filter((a) => a.unitId).length;
                    return (
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{projectsN}</span> proj
                        {wings ? ` · ${wings} wing` : ""}
                        {units ? ` · ${units} unit` : ""}
                      </span>
                    );
                  },
                },
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
                            onSelect={() => {
                              setTab("access");
                              setAccessEmployeeFilter(r.id);
                              openGrantAccess(r.id);
                            }}
                          >
                            Grant access
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={grantAllProjects.isPending}
                            onSelect={() => grantAllProjects.mutate(r.id)}
                          >
                            Grant all projects
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={r.id === me?.id} onSelect={() => toggleStatus.mutate(r)}>
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
          </>
        )}

        {tab === "roles" && (
          <DataTable
            rows={roles?.data ?? []}
            onRowClick={openEditRole}
            empty={<EmptyState icon={Shield} title="No roles yet." actionLabel="Add role" onAction={openCreateRole} />}
            columns={[
              {
                key: "name",
                header: "Role",
                cell: (r) => (
                  <span className="font-medium">
                    {r.name}
                    {r.isSystem ? (
                      <span className="ml-1.5 text-[10px] font-medium uppercase text-muted-foreground">System</span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: "perms",
                header: "Permissions",
                cell: (r) => (
                  <div className="flex max-w-md flex-wrap gap-1">
                    {r.permissions.map((p) => (
                      <span
                        key={p.action}
                        className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground"
                      >
                        {actionLabel(p.action)}
                      </span>
                    ))}
                  </div>
                ),
              },
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
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Select value={accessEmployeeFilter} onValueChange={setAccessEmployeeFilter}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {(allUsers?.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={accessProjectFilter} onValueChange={setAccessProjectFilter}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {(projects?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={accessScopeFilter} onValueChange={setAccessScopeFilter}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="wing">Wing</SelectItem>
                  <SelectItem value="unit">Unit</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setAccessEmployeeFilter("all");
                  setAccessProjectFilter("all");
                  setAccessScopeFilter("all");
                }}
              >
                Reset
              </Button>
            </div>
            <DataTable
              rows={accessRows}
              empty={
                <EmptyState
                  icon={KeyRound}
                  title="No project access granted yet."
                  actionLabel="Grant access"
                  onAction={() => openGrantAccess()}
                />
              }
              columns={[
                {
                  key: "user",
                  header: "Employee",
                  cell: (r) => (
                    <span>
                      <span className="block font-medium">{r.userName}</span>
                      {r.userEmail ? (
                        <span className="block text-[10px] text-muted-foreground">{r.userEmail}</span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "project",
                  header: "Project",
                  cell: (r) => (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {r.project.name}
                    </span>
                  ),
                },
                {
                  key: "scope",
                  header: "Level",
                  cell: (r) => (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        scopeBadge(r) === "Project" && "border-primary/25 bg-primary/10 text-primary",
                        scopeBadge(r) === "Wing" && "border-warning/30 bg-warning/10 text-warning-foreground",
                        scopeBadge(r) === "Unit" && "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {scopeBadge(r)}
                    </span>
                  ),
                },
                { key: "detail", header: "Scope detail", cell: (r) => scopeDetail(r) },
                {
                  key: "actions",
                  header: "",
                  className: "w-24 text-right",
                  cell: (r) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        setConfirm({
                          kind: "access",
                          id: r.id,
                          label: `${r.userName} · ${r.project.name} · ${scopeDetail(r)}`,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  ),
                },
              ]}
            />
          </>
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
              <Input
                className="h-8"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input className="h-8" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={editingUser ? "New password (optional)" : "Password"}>
              <PasswordInput
                className="h-8"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Role">
              <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {(roles?.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
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
              ) : (
                <span />
              )}
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
            <DialogDescription>
              Permissions apply on every authenticated request — no re-login required.
            </DialogDescription>
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
            ) : (
              <span />
            )}
            <Button size="sm" disabled={!roleValid || saveRole.isPending} onClick={() => saveRole.mutate()}>
              {saveRole.isPending ? "Saving…" : editingRole ? "Save changes" : "Create role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={accessOpen}
        onOpenChange={(o) => {
          setAccessOpen(o);
          if (!o) setAccessForm(emptyAccess());
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant project access</DialogTitle>
            <DialogDescription>
              Choose entire project, a wing, or a single unit. Broader grants replace narrower ones.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Field label="Employee">
              <Select
                value={accessForm.employeeId}
                onValueChange={(v) => setAccessForm((f) => ({ ...f, employeeId: v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {(allUsers?.data ?? users?.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Project">
              <Select
                value={accessForm.projectId}
                onValueChange={(v) =>
                  setAccessForm((f) => ({ ...f, projectId: v, wingId: "", unitId: "", scope: "project" }))
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects?.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Access level">
              <Select
                value={accessForm.scope}
                onValueChange={(v) =>
                  setAccessForm((f) => ({
                    ...f,
                    scope: v as AccessForm["scope"],
                    wingId: v === "project" ? "" : f.wingId,
                    unitId: v === "unit" ? f.unitId : "",
                  }))
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Entire project</SelectItem>
                  <SelectItem value="wing">Single wing</SelectItem>
                  <SelectItem value="unit">Single unit</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {accessForm.scope !== "project" ? (
              <Field label="Wing">
                <Select
                  value={accessForm.wingId}
                  onValueChange={(v) => setAccessForm((f) => ({ ...f, wingId: v, unitId: "" }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select wing" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectDetail?.wings ?? []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {accessForm.scope === "unit" ? (
              <Field label="Unit">
                <Select
                  value={accessForm.unitId}
                  onValueChange={(v) => {
                    const u = units?.data?.find((x) => x.id === v);
                    setAccessForm((f) => ({
                      ...f,
                      unitId: v,
                      wingId: u?.floor.wing.id ?? f.wingId,
                    }));
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {(units?.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.unitNumber} · {u.floor.wing.name} · L{u.floor.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {accessForm.scope === "project"
                ? "Full project access · any wing/unit. Narrower grants for this project are cleared."
                : accessForm.scope === "wing"
                  ? "Limited to one wing (and its units)."
                  : "Limited to one unit only."}
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAccessOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!accessValid || grant.isPending} onClick={() => grant.mutate()}>
                {grant.isPending ? "Granting…" : "Grant access"}
              </Button>
            </div>
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
                ? `Remove access for ${confirm.label}. Takes effect immediately on their next action.`
                : confirm?.kind === "role"
                  ? `Delete “${confirm.label}”. This cannot be undone.`
                  : `Delete ${confirm?.label}. Bookings they created stay in place.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Working…" : confirm?.kind === "access" ? "Revoke" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrap>
  );
}
