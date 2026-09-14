import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { ImageUpload } from "@/components/shared/image-upload";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { DEFAULT_PROJECT_PHOTO } from "@/lib/project-photo";
import { qk } from "@/lib/query-keys";
import { useProjectContextStore } from "@/stores/project-context";

type Form = {
  companyId: string;
  name: string;
  code: string;
  location: string;
  address: string;
  reraNumber: string;
  reraDate: string;
  projectType: string;
  totalWings: number;
  totalFloors: number;
  unitsPerFloor: number;
  status: string;
  expectedCompletion: string;
  launchDate: string;
  photoUrl: string | null;
};

const empty: Form = {
  companyId: "",
  name: "",
  code: "",
  location: "",
  address: "",
  reraNumber: "",
  reraDate: "",
  projectType: "Residential",
  totalWings: 1,
  totalFloors: 10,
  unitsPerFloor: 8,
  status: "active",
  expectedCompletion: "",
  launchDate: "",
  photoUrl: null,
};

export function ProjectFormPage() {
  const { companyId, id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setProject = useProjectContextStore((s) => s.setProject);
  const [form, setForm] = useState<Form>({ ...empty, companyId: companyId ?? "" });

  const { data: companies } = useQuery({
    queryKey: qk.companies,
    queryFn: () => api.get<ListResponse<{ id: string; name: string }>>("/api/companies", { pageSize: 100 }),
    enabled: !companyId && !isEdit,
  });

  const { data } = useQuery({
    queryKey: id ? qk.project(id) : ["new-project"],
    queryFn: () => api.get<Form & { companyId: string }>(`/api/projects/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      ...empty,
      ...data,
      companyId: data.companyId,
      location: data.location ?? "",
      address: data.address ?? "",
      reraNumber: data.reraNumber ?? "",
      reraDate: data.reraDate ? String(data.reraDate).slice(0, 10) : "",
      expectedCompletion: data.expectedCompletion ? String(data.expectedCompletion).slice(0, 10) : "",
      launchDate: data.launchDate ? String(data.launchDate).slice(0, 10) : "",
      photoUrl: data.photoUrl ?? null,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        reraDate: form.reraDate || null,
        expectedCompletion: form.expectedCompletion || null,
        launchDate: form.launchDate || null,
      };
      if (isEdit) return api.patch<{ id: string; companyId?: string }>(`/api/projects/${id}`, payload);
      const cid = companyId || form.companyId;
      if (!cid) throw new ApiError("Select a company", 422);
      return api.post<{ id: string; companyId?: string }>(`/api/companies/${cid}/projects`, payload);
    },
    onSuccess: (res: { id: string; companyId?: string }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(isEdit ? "Project updated" : "Project created");
      const pid = isEdit ? id! : res.id;
      const cid = companyId ?? res.companyId ?? form.companyId;
      setProject(pid, cid || null);
      navigate(isEdit ? `/projects/${pid}` : `/projects/${pid}/setup`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preview = form.totalWings * form.totalFloors * form.unitsPerFloor;

  return (
    <PageWrap>
      <PageHeader
        title={isEdit ? "Edit project" : "Create project"}
        subtitle="Details, photo and inventory shape"
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: isEdit ? "Project" : "New project" },
        ]}
      />
      <CardSoft className="max-w-3xl">
        <form
          className="grid gap-2.5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <ImageUpload
              label="Project photo"
              variant="cover"
              hint="Elevation or site image shown on inventory and overview"
              value={form.photoUrl}
              fallback={DEFAULT_PROJECT_PHOTO}
              onChange={(url) => set("photoUrl", url)}
            />
          </div>
          {!companyId && !isEdit ? (
            <Field label="Company" className="sm:col-span-2">
              <Select value={form.companyId || undefined} onValueChange={(v) => set("companyId", v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {(companies?.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Project name">
            <Input className="h-10" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Code">
            <Input className="h-10" value={form.code} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="Location">
            <Input className="h-8" value={form.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={form.projectType} onValueChange={(v) => set("projectType", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Residential">Residential</SelectItem>
                <SelectItem value="Commercial">Commercial</SelectItem>
                <SelectItem value="Mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input className="h-8" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="RERA number">
            <Input className="h-8" value={form.reraNumber} onChange={(e) => set("reraNumber", e.target.value)} />
          </Field>
          <Field label="RERA date">
            <Input className="h-8" type="date" value={form.reraDate} onChange={(e) => set("reraDate", e.target.value)} />
          </Field>
          <Field label="Launch date">
            <Input className="h-8" type="date" value={form.launchDate} onChange={(e) => set("launchDate", e.target.value)} />
          </Field>
          <Field label="Expected completion">
            <Input className="h-8" type="date" value={form.expectedCompletion} onChange={(e) => set("expectedCompletion", e.target.value)} />
          </Field>
          <Field label="Total wings">
            <Input className="h-8" type="number" value={form.totalWings} onChange={(e) => set("totalWings", Number(e.target.value))} />
          </Field>
          <Field label="Total floors">
            <Input className="h-8" type="number" value={form.totalFloors} onChange={(e) => set("totalFloors", Number(e.target.value))} />
          </Field>
          <Field label="Units per floor">
            <Input className="h-8" type="number" value={form.unitsPerFloor} onChange={(e) => set("unitsPerFloor", Number(e.target.value))} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Live shape preview: {form.totalWings} × {form.totalFloors} × {form.unitsPerFloor} ={" "}
            <span className="font-semibold tabular-nums text-foreground">{preview}</span> units
          </p>
          <div className="sm:col-span-2 flex justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={save.isPending}>Save project</Button>
          </div>
        </form>
      </CardSoft>
    </PageWrap>
  );
}
