import { useQuery } from "@tanstack/react-query";
import { api, type ListResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export type MasterOption = {
  id: string;
  group: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

export function useMasterOptions(group: string, enabled = true) {
  return useQuery({
    queryKey: qk.masters(group),
    queryFn: () =>
      api.get<ListResponse<MasterOption>>("/api/masters", { group, pageSize: 200 }),
    enabled,
    staleTime: 60_000,
  });
}
