import { Building2, CreditCard, LayoutDashboard, LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { usePlatformAuthStore } from "@/stores/platform-auth";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/admin", end: true, label: "Accounts", icon: LayoutDashboard },
  { to: "/admin/plans", label: "Plans", icon: CreditCard },
] as const;

export function PlatformShell() {
  const user = usePlatformAuthStore((s) => s.user);
  const clear = usePlatformAuthStore((s) => s.clear);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-52 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
            <Building2 className="h-4 w-4 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">Platform</p>
            <p className="truncate text-[10px] text-sidebar-foreground/60">Buildesk UnitDesk</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? Boolean(item.end) : false}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    isActive && "bg-sidebar-accent text-white",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <p className="truncate px-2 text-[11px] text-sidebar-foreground/60">{user?.email}</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 w-full justify-start text-sidebar-foreground/80"
            onClick={() => {
              clear();
              navigate("/admin/login");
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b px-3 md:hidden">
          <p className="text-sm font-semibold">Platform Admin</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clear();
              navigate("/admin/login");
            }}
          >
            Sign out
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
