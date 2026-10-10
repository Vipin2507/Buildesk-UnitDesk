import {
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { usePlatformAuthStore } from "@/stores/platform-auth";

const nav = [
  { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/accounts", label: "Accounts", icon: Building2 },
  { to: "/admin/plans", label: "Plans", icon: CreditCard },
  { to: "/admin/operators", label: "Operators", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function PlatformShell() {
  const user = usePlatformAuthStore((s) => s.user);
  const clear = usePlatformAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function signOut() {
    clear();
    navigate("/admin/login");
  }

  const navLinks = (
    <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? Boolean(item.end) : false}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                isActive && "bg-sidebar-accent text-white shadow-sm",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0 opacity-90" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,hsl(var(--muted)/0.55)_0%,hsl(var(--background))_220px)]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2.5 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm">
            <Building2 className="h-4 w-4 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight">UnitDesk</p>
            <p className="truncate text-[10px] text-sidebar-foreground/55">Platform control</p>
          </div>
        </div>
        {navLinks}
        <div className="space-y-1.5 border-t border-sidebar-border p-2.5">
          <p className="truncate px-1 text-[11px] font-medium text-sidebar-foreground/90">
            {user?.name}
          </p>
          <p className="truncate px-1 text-[10px] text-sidebar-foreground/50">{user?.email}</p>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/75 hover:text-sidebar-foreground"
            onClick={signOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-sidebar/50 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-elevated">
            <div className="flex h-14 items-center justify-between px-3">
              <p className="text-sm font-semibold">Platform</p>
              <Button size="icon-sm" variant="ghost" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4 text-sidebar-foreground" />
              </Button>
            </div>
            {navLinks}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur md:h-14 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 md:hidden">
              <p className="truncate text-sm font-semibold">Platform Admin</p>
            </div>
            <p className="hidden text-xs text-muted-foreground md:block">
              Manage client workspaces, plans, and platform access
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => navigate("/admin/accounts")}
            >
              <Search className="h-3.5 w-3.5" />
              Find account
            </Button>
            <Button size="sm" variant="ghost" className="md:hidden" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
