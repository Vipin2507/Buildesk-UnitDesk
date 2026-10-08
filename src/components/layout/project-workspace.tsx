import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Building,
  CalendarCheck,
  FileBarChart,
  LayoutGrid,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

export function ProjectWorkspace() {
  const { id } = useParams();
  const setProject = useProjectContextStore((s) => s.setProject);
  const base = id ? `/projects/${id}` : "/projects";

  const tabs = [
    { to: base, end: true, label: "Overview", icon: Building },
    { to: `${base}/inventory`, label: "Unit Inventory", icon: LayoutGrid },
    { to: `${base}/bookings`, label: "Bookings", icon: CalendarCheck },
    { to: `${base}/receipts`, label: "Demand & Receipts", icon: Wallet },
    { to: `${base}/documents`, label: "Documents", icon: FileBarChart },
    { to: `${base}/crm`, label: "CRM Activities", icon: Activity },
  ] as const;

  const { data: project } = useQuery({
    queryKey: id ? qk.project(id) : ["project-workspace"],
    queryFn: () =>
      api.get<{ id: string; name: string; companyId: string; company?: { id: string; name: string } }>(
        `/api/projects/${id}`,
      ),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!project) return;
    setProject(project.id, project.companyId ?? project.company?.id ?? null);
  }, [project, setProject]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-background/95 px-3 pt-3 backdrop-blur sm:px-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All projects
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <p className="truncate text-sm font-semibold tracking-tight">
            {project?.name ?? "Project"}
          </p>
        </div>
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
