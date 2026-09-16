import {
  Activity,
  Building2,
  Building,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Plug,
  Settings,
  Shield,
  Users,
  Wallet,
  Boxes,
  CalendarCheck,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useSidebarStore } from "@/stores/sidebar";
import { useProjectContextStore } from "@/stores/project-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown } from "lucide-react";

const projectChildren = [
  { to: (id: string) => `/projects/${id}`, label: "Overview", icon: Building },
  { to: (id: string) => `/projects/${id}/inventory`, label: "Unit Inventory", icon: LayoutGrid },
  { to: (id: string) => `/projects/${id}/bookings`, label: "Bookings", icon: CalendarCheck },
  { to: (id: string) => `/projects/${id}/receipts`, label: "Demand & Receipts", icon: Wallet },
  { to: (id: string) => `/projects/${id}/documents`, label: "Documents", icon: FileBarChart },
  { to: (id: string) => `/projects/${id}/crm`, label: "CRM Activities", icon: Activity },
];

const items = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/companies", icon: Building2, label: "Companies" },
  { to: "/inventory", icon: Boxes, label: "Inventory" },
  { to: "/bookings", icon: CalendarCheck, label: "Bookings" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/channel-partners", icon: Handshake, label: "Channel Partners" },
  { to: "/payments", icon: CreditCard, label: "Payments" },
  { to: "/approvals", icon: ClipboardCheck, label: "Approvals" },
  { to: "/masters", icon: Boxes, label: "Masters" },
  { to: "/marketing", icon: Megaphone, label: "Marketing" },
  { to: "/reports", icon: FileBarChart, label: "Reports" },
  { to: "/integrations", icon: Plug, label: "Integrations" },
  { to: "/users", icon: Shield, label: "Users & Roles" },
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
  const active = end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);

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
  const projectsOpen = useSidebarStore((s) => s.projectsOpen);
  const toggleProjectsOpen = useSidebarStore((s) => s.toggleProjectsOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const projectId = useProjectContextStore((s) => s.projectId);
  const navigate = useNavigate();
  const location = useLocation();
  const projectActive = location.pathname.startsWith("/projects");

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
        <RailLink to="/" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} end />
        <RailLink to="/companies" icon={Building2} label="Companies" collapsed={collapsed} />

        {collapsed ? (
          <RailLink to="/projects" icon={Building} label="Projects" collapsed end />
        ) : (
          <div>
            <div
              className={cn(
                "flex w-full items-center rounded-md text-[13px] font-medium text-sidebar-foreground/80",
                (projectActive || location.pathname === "/projects") && "text-white",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  navigate("/projects");
                  if (!projectsOpen) toggleProjectsOpen();
                }}
                className={cn(
                  "relative flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-sidebar-accent",
                  location.pathname === "/projects" && "bg-sidebar-accent text-white",
                )}
              >
                {location.pathname === "/projects" ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-md bg-sidebar-accent"
                    transition={{ type: "spring", stiffness: 390, damping: 34 }}
                  />
                ) : null}
                <Building className="relative z-10 h-4 w-4" />
                <span className="relative z-10 truncate">Projects</span>
              </button>
              <button
                type="button"
                onClick={toggleProjectsOpen}
                className="mr-1 rounded-md p-1.5 hover:bg-sidebar-accent"
                aria-label={projectsOpen ? "Collapse project menu" : "Expand project menu"}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !projectsOpen && "-rotate-90")} />
              </button>
            </div>
            {projectsOpen ? (
              <div className="ml-2 space-y-0.5 border-l border-sidebar-border pl-2">
                <NavLink
                  to="/projects"
                  end
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isActive && "text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-md bg-sidebar-accent"
                          transition={{ type: "spring", stiffness: 390, damping: 34 }}
                        />
                      ) : null}
                      <Boxes className="relative z-10 h-3.5 w-3.5" />
                      <span className="relative z-10">All projects</span>
                    </>
                  )}
                </NavLink>
                {projectChildren.map((child) => (
                  <NavLink
                    key={child.label}
                    to={projectId ? child.to(projectId) : "/projects"}
                    end={child.label === "Overview"}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        isActive && projectId && "text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && projectId ? (
                          <motion.span
                            layoutId="nav-pill"
                            className="absolute inset-0 rounded-md bg-sidebar-accent"
                            transition={{ type: "spring", stiffness: 390, damping: 34 }}
                          />
                        ) : null}
                        <child.icon className="relative z-10 h-3.5 w-3.5" />
                        <span className="relative z-10">{child.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {items.slice(2).map((item) => (
          <RailLink key={item.to} to={item.to} icon={item.icon} label={item.label} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
