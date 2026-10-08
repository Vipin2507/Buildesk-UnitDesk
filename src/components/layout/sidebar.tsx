import {
  Building2,
  Building,
  FileBarChart,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useSidebarStore } from "@/stores/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const items = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/companies", icon: Building2, label: "Companies" },
  { to: "/projects", icon: Building, label: "Projects" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/reports", icon: FileBarChart, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

function RailLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  collapsed: boolean;
  end?: boolean;
}) {
  const location = useLocation();
  const active = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`);

  const inner = (
    <NavLink
      to={to}
      end={end}
      className={cn(
        "relative flex items-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        collapsed ? "h-9 w-9 justify-center" : "gap-2 px-2.5 py-1.5 text-[13px] font-medium",
        active && "text-white",
      )}
    >
      {active ? (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-md bg-sidebar-accent"
          transition={{ type: "spring", stiffness: 390, damping: 34 }}
        />
      ) : null}
      {!collapsed && active ? (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
      ) : null}
      <Icon className="relative z-10 h-4 w-4" />
      {!collapsed ? <span className="relative z-10 truncate">{label}</span> : null}
    </NavLink>
  );

  if (!collapsed) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const navigate = useNavigate();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        collapsed ? "w-[52px]" : "w-52",
      )}
      style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
    >
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "gap-2 px-2.5")}>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary shadow-[var(--shadow-brand-glow)]"
        >
          <Building2 className="h-4 w-4 text-white" />
        </button>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">UnitDesk</p>
            <p className="truncate text-[10px] text-sidebar-foreground/60">Buildesk</p>
          </div>
        ) : null}
      </div>

      <nav
        className={cn("flex-1 space-y-0.5 overflow-y-auto scrollbar-none", collapsed ? "px-[8px]" : "px-1.5")}
        onClick={() => setMobileOpen(false)}
      >
        {items.map((item) => (
          <RailLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            end={item.end}
          />
        ))}
      </nav>
    </aside>
  );
}
