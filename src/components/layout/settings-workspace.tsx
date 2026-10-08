import { Boxes, Handshake, Settings, Shield } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/cn";

const tabs = [
  { to: "/settings", end: true, label: "General", icon: Settings },
  { to: "/settings/channel-partners", label: "Channel Partners", icon: Handshake },
  { to: "/settings/masters", label: "Masters", icon: Boxes },
  { to: "/settings/users", label: "Users & Roles", icon: Shield },
] as const;

export function SettingsWorkspace() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-background/95 px-3 pt-3 backdrop-blur sm:px-4">
        <p className="mb-2.5 text-sm font-semibold tracking-tight">Settings</p>
        <nav className="-mb-px flex gap-0.5 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.label}
                to={tab.to}
                end={"end" in tab ? Boolean(tab.end) : false}
                className={({ isActive }) =>
                  cn(
                    "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
