import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CardSoft } from "@/components/shared/card-soft";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { UnitPlanImage } from "@/components/shared/unit-plan-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { isCustomUnitPhoto, resolveUnitPhotoUrl } from "@/lib/unit-plans";

type Wing = {
  id: string;
  name: string;
  floors: { id: string; number: number }[];
};

type Project = {
  id: string;
  name: string;
  company: { id: string; name: string };
  wings: Wing[];
};

type UnitDetail = {
  id: string;
  unitNumber: string;
  unitType: string | null;
  configuration: string | null;
  carpetArea: number | null;
  builtUpArea: number | null;
  saleableArea: number | null;
  balconyArea: number | null;
  facing: string | null;
  parking: string | null;
  basePrice: number | null;
  plc: number | null;
  otherCharges: number | null;
  remarks: string | null;
  photoUrl: string | null;
  status: string;
  floor: { number: number; wing: { id: string; name: string; project: { id: string; name: string } } };
};

type Form = {
  wingId: string;
  floorNumber: string;
  unitNumber: string;
  unitType: string;
  configuration: string;
  carpetArea: string;
  builtUpArea: string;
  saleableArea: string;
  balconyArea: string;
  facing: string;
  parking: string;
  basePrice: string;
  plc: string;
  otherCharges: string;
  remarks: string;
  photoUrl: string | null;
  status: string;
};

const empty: Form = {
  wingId: "",
  floorNumber: "1",
  unitNumber: "",
  unitType: "2BHK",
  configuration: "2 BHK",
  carpetArea: "",
  builtUpArea: "",
  saleableArea: "",
  balconyArea: "",
  facing: "",
  parking: "",
  basePrice: "",
  plc: "",
  otherCharges: "",
  remarks: "",
  photoUrl: null,
  status: "available",
};

function num(value: string) {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function UnitFormPage() {
  const { id, unitId } = useParams();
  const isEdit = Boolean(unitId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  const { data: project } = useQuery({
    queryKey: qk.project(id!),
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  const { data: unit } = useQuery({
    queryKey: qk.unit(unitId ?? ""),
    queryFn: () => api.get<UnitDetail>(`/api/units/${unitId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!unit) return;
    setForm({
      wingId: unit.floor.wing.id,
      floorNumber: String(unit.floor.number),
      unitNumber: unit.unitNumber,
      unitType: unit.unitType ?? "",
      configuration: unit.configuration ?? "",
      carpetArea: unit.carpetArea != null ? String(unit.carpetArea) : "",
      builtUpArea: unit.builtUpArea != null ? String(unit.builtUpArea) : "",
      saleableArea: unit.saleableArea != null ? String(unit.saleableArea) : "",
      balconyArea: unit.balconyArea != null ? String(unit.balconyArea) : "",
      facing: unit.facing ?? "",
      parking: unit.parking ?? "",
      basePrice: unit.basePrice != null ? String(unit.basePrice) : "",
      plc: unit.plc != null ? String(unit.plc) : "",
      otherCharges: unit.otherCharges != null ? String(unit.otherCharges) : "",
      remarks: unit.remarks ?? "",
      photoUrl: unit.photoUrl,
      status: unit.status,
    });
  }, [unit]);

  useEffect(() => {
    if (isEdit || form.wingId || !project?.wings[0]) return;
    setForm((f) => ({ ...f, wingId: project.wings[0].id }));
  }, [isEdit, form.wingId, project]);

  const floors = useMemo(() => {
    const wing = project?.wings.find((w) => w.id === form.wingId);
    return wing?.floors ?? [];
  }, [project, form.wingId]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        wingId: form.wingId,
        floorNumber: Number(form.floorNumber),
        unitNumber: form.unitNumber,
        unitType: form.unitType || null,
        configuration: form.configuration || null,
        carpetArea: num(form.carpetArea),
        builtUpArea: num(form.builtUpArea),
        saleableArea: num(form.saleableArea),
        balconyArea: num(form.balconyArea),
        facing: form.facing || null,
        parking: form.parking || null,
        basePrice: num(form.basePrice),
        plc: num(form.plc),
        otherCharges: num(form.otherCharges),
        remarks: form.remarks || null,
        photoUrl: form.photoUrl,
        status: form.status,
      };
      return isEdit ? api.patch(`/api/units/${unitId}`, payload) : api.post(`/api/projects/${id}/units`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      if (unitId) qc.invalidateQueries({ queryKey: qk.unit(unitId) });
      toast.success(isEdit ? "Unit updated" : "Unit created");
      navigate(`/projects/${id}/units`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <PageWrap>
      <PageHeader
        title={isEdit ? `Edit ${form.unitNumber || "unit"}` : "Add unit"}
        subtitle={project ? `${project.company.name} · ${project.name}` : "Unit master"}
        breadcrumbs={[
          { label: "Projects", to: "/projects" },
          { label: project?.name ?? "Project", to: `/projects/${id}/inventory` },
          { label: "Units", to: `/projects/${id}/units` },
          { label: isEdit ? "Edit" : "New" },
        ]}
      />
      <CardSoft className="max-w-3xl">
        {!isEdit && project && !project.wings.length ? (
          <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            This project has no wings yet.{" "}
            <button type="button" className="font-medium text-primary" onClick={() => navigate(`/projects/${id}/setup`)}>
              Generate inventory
            </button>{" "}
            first, or add a wing during setup.
          </div>
        ) : null}
        <form
          className="grid gap-2.5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium">Floor plan / unit photo</p>
            <UnitPlanImage
              src={resolveUnitPhotoUrl(form.photoUrl, form.unitType, form.configuration)}
              size="lg"
              className="max-w-sm"
              editable
              isCustom={isCustomUnitPhoto(form.photoUrl)}
              onChange={(url) => set("photoUrl", url)}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Defaults from unit type (1 / 2 / 3 BHK). Hover the image to replace or reset.
            </p>
          </div>
          <Field label="Wing">
            <Select value={form.wingId} onValueChange={(v) => set("wingId", v)} disabled={isEdit}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select wing" /></SelectTrigger>
              <SelectContent>
                {(project?.wings ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>Wing {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Floor (0 = ground)">
            {floors.length && isEdit ? (
              <Select value={form.floorNumber} onValueChange={(v) => set("floorNumber", v)} disabled>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {floors.map((f) => (
                    <SelectItem key={f.id} value={String(f.number)}>
                      {f.number === 0 ? "Ground" : `Floor ${f.number}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input className="h-8" type="number" min={0} value={form.floorNumber} onChange={(e) => set("floorNumber", e.target.value)} />
            )}
          </Field>
          <Field label="Unit number">
            <Input className="h-10" value={form.unitNumber} onChange={(e) => set("unitNumber", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="not_available">Not released</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unit type">
            <Select
              value={form.unitType || "2BHK"}
              onValueChange={(v) => {
                set("unitType", v);
                set("configuration", v.replace("BHK", " BHK"));
              }}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1BHK">1BHK</SelectItem>
                <SelectItem value="2BHK">2BHK</SelectItem>
                <SelectItem value="3BHK">3BHK</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Configuration">
            <Input className="h-8" value={form.configuration} onChange={(e) => set("configuration", e.target.value)} placeholder="2 BHK" />
          </Field>
          <Field label="Carpet area (sq.ft)">
            <Input className="h-8" type="number" value={form.carpetArea} onChange={(e) => set("carpetArea", e.target.value)} />
          </Field>
          <Field label="Built-up (sq.ft)">
            <Input className="h-8" type="number" value={form.builtUpArea} onChange={(e) => set("builtUpArea", e.target.value)} />
          </Field>
          <Field label="Saleable (sq.ft)">
            <Input className="h-8" type="number" value={form.saleableArea} onChange={(e) => set("saleableArea", e.target.value)} />
          </Field>
          <Field label="Balcony (sq.ft)">
            <Input className="h-8" type="number" value={form.balconyArea} onChange={(e) => set("balconyArea", e.target.value)} />
          </Field>
          <Field label="Facing">
            <Select value={form.facing || "none"} onValueChange={(v) => set("facing", v === "none" ? "" : v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Facing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="East">East</SelectItem>
                <SelectItem value="West">West</SelectItem>
                <SelectItem value="North">North</SelectItem>
                <SelectItem value="South">South</SelectItem>
                <SelectItem value="North-East">North-East</SelectItem>
                <SelectItem value="North-West">North-West</SelectItem>
                <SelectItem value="South-East">South-East</SelectItem>
                <SelectItem value="South-West">South-West</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Parking">
            <Input className="h-8" value={form.parking} onChange={(e) => set("parking", e.target.value)} />
          </Field>
          <Field label="Base price">
            <Input className="h-8" type="number" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
          </Field>
          <Field label="PLC">
            <Input className="h-8" type="number" value={form.plc} onChange={(e) => set("plc", e.target.value)} />
          </Field>
          <Field label="Other charges">
            <Input className="h-8" type="number" value={form.otherCharges} onChange={(e) => set("otherCharges", e.target.value)} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/units`)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={save.isPending || !form.unitNumber || !form.wingId}>
              {isEdit ? "Save unit" : "Create unit"}
            </Button>
          </div>
        </form>
      </CardSoft>
    </PageWrap>
  );
}
