import { FileText, Handshake, LayoutDashboard, CalendarCheck } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/partner", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/partner/bookings", icon: CalendarCheck, label: "Bookings" },
  { to: "/partner/documents", icon: FileText, label: "Documents" },
];

export function PartnerShell() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-52 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 px-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
            <Handshake className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="text-[13px] font-semibold">Partner portal</p>
            <p className="truncate text-[10px] text-sidebar-foreground/60">{user?.name}</p>
          </div>
        </div>
        <nav className="space-y-0.5 px-1.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent",
                  isActive && "bg-sidebar-accent text-white",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <p className="text-sm font-medium">{user?.name}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clear();
              navigate("/partner/login");
            }}
          >
            Sign out
          </Button>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
