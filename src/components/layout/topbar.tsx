import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeStore } from "@/stores/theme";
import { useSidebarStore } from "@/stores/sidebar";
import { useAuthStore } from "@/stores/auth";
import { useDrilldownSheetStore } from "@/stores/drilldown";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { api, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";

type SearchRes = {
  units: { id: string; unitNumber: string; floor: { wing: { name: string; project: { id: string; name: string } } } }[];
  bookings: { id: string; bookingNumber: string; project: { name: string } }[];
  customers: { id: string; name: string; mobile: string; booking: { id: string } }[];
  partners: { id: string; name: string }[];
};

type Note = { id: string; title: string; body: string; readAt: string | null; linkUrl: string | null };

export function Topbar() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const openUnit = useDrilldownSheetStore((s) => s.open);
  const onInventory = /\/projects\/[^/]+\/inventory\/?$/.test(location.pathname);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results } = useQuery({
    queryKey: qk.search(debounced),
    queryFn: () => api.get<SearchRes>("/api/search", { q: debounced }),
    enabled: debounced.length >= 2,
  });
  const { data: notes } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.get<ListResponse<Note> & { unread: number }>("/api/notifications", { pageSize: 20 }),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const open = Boolean(debounced.length >= 2 && results);
  const hits = useMemo(() => {
    if (!results) return [];
    return [
      ...results.units.map((u) => ({
        id: u.id,
        label: `Unit ${u.unitNumber}`,
        hint: `${u.floor.wing.project.name} · ${u.floor.wing.name}`,
        go: () => {
          if (onInventory) {
            openUnit("unit", u.id, { docked: true, neighborIds: [u.id] });
            navigate(`/projects/${u.floor.wing.project.id}/inventory`);
            return;
          }
          openUnit("unit", u.id);
        },
      })),
      ...results.bookings.map((b) => ({
        id: b.id,
        label: b.bookingNumber,
        hint: b.project.name,
        go: () => navigate(`/bookings/${b.id}`),
      })),
      ...results.customers.map((c) => ({
        id: c.id,
        label: c.name,
        hint: c.mobile,
        go: () => navigate(`/bookings/${c.booking.id}`),
      })),
      ...results.partners.map((p) => ({
        id: p.id,
        label: p.name,
        hint: "Channel partner",
        go: () => navigate(`/channel-partners/${p.id}`),
      })),
    ];
  }, [results, navigate, openUnit, onInventory]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:h-16 md:px-4">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="hidden h-9 w-9 items-center justify-center rounded-md hover:bg-muted md:flex"
        onClick={toggleCollapsed}
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search units, bookings, customers…"
          className="h-10 rounded-lg border bg-card pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {open ? (
          <div className="absolute top-[calc(100%+4px)] z-30 w-full overflow-hidden rounded-lg border bg-popover shadow-elevated">
            {hits.length ? (
              hits.map((h) => (
                <button
                  key={h.id + h.label}
                  type="button"
                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    h.go();
                    setQ("");
                    setDebounced("");
                  }}
                >
                  <span className="text-sm">{h.label}</span>
                  <span className="text-[11px] text-muted-foreground">{h.hint}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
            )}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted">
            <Bell className="h-4 w-4" />
            {(notes?.unread ?? 0) > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-semibold">Notifications</p>
            <button type="button" className="text-[11px] text-primary" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          </div>
          <DropdownMenuSeparator />
          {(notes?.data ?? []).length ? (
            (notes?.data ?? []).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex-col items-start gap-0.5"
                onClick={() => {
                  markRead.mutate(n.id);
                  if (n.linkUrl) navigate(n.linkUrl);
                }}
              >
                <span className="text-sm">{n.title}</span>
                <span className="text-[11px] text-muted-foreground">{n.body}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No notifications</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-full">
            <Avatar>
              <AvatarFallback>{user ? initials(user.name) : "U"}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-[11px] text-muted-foreground">{user?.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              clear();
              navigate("/login");
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
