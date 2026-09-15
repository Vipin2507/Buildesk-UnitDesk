import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/shared/field";
import { UnitPlanImage } from "@/components/shared/unit-plan-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { isCustomUnitPhoto, projectPlansFrom, resolveUnitPhotoUrl, type ProjectPlanUrls } from "@/lib/unit-plans";

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
  floor?: {
    wing?: {
      project?: ProjectPlanUrls & { id?: string; name?: string };
    };
  };
};

type Form = {
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

function num(value: string) {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toForm(unit: UnitDetail): Form {
  return {
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
  };
}

export function UnitEditDialog({
  unitId,
  open,
  onOpenChange,
}: {
  unitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);

  const { data: unit } = useQuery({
    queryKey: qk.unit(unitId ?? ""),
    queryFn: () => api.get<UnitDetail>(`/api/units/${unitId}`),
    enabled: open && Boolean(unitId),
  });

  useEffect(() => {
    if (unit) setForm(toForm(unit));
  }, [unit]);

  const save = useMutation({
    mutationFn: () => {
      if (!form || !unitId) throw new Error("Missing unit");
      return api.patch(`/api/units/${unitId}`, {
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
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.unit(unitId ?? "") });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      toast.success("Unit updated");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Save failed"),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit unit</DialogTitle>
          <DialogDescription>Update specs, pricing, status and floor-plan photo.</DialogDescription>
        </DialogHeader>
        {form ? (
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
                src={resolveUnitPhotoUrl(
                  form.photoUrl,
                  form.unitType,
                  form.configuration,
                  projectPlansFrom(unit?.floor?.wing?.project),
                )}
                size="lg"
                className="max-w-xs"
                editable
                isCustom={isCustomUnitPhoto(form.photoUrl)}
                onChange={(url) => set("photoUrl", url)}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Defaults to the project or system {form.configuration || form.unitType || "unit type"} plan. Replace to override for this unit.
              </p>
            </div>
            <Field label="Unit number">
              <Input className="h-9" value={form.unitNumber} onChange={(e) => set("unitNumber", e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1BHK">1BHK</SelectItem>
                  <SelectItem value="2BHK">2BHK</SelectItem>
                  <SelectItem value="3BHK">3BHK</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Configuration">
              <Input className="h-9" value={form.configuration} onChange={(e) => set("configuration", e.target.value)} />
            </Field>
            <Field label="Carpet area">
              <Input className="h-9" type="number" value={form.carpetArea} onChange={(e) => set("carpetArea", e.target.value)} />
            </Field>
            <Field label="Built-up">
              <Input className="h-9" type="number" value={form.builtUpArea} onChange={(e) => set("builtUpArea", e.target.value)} />
            </Field>
            <Field label="Saleable">
              <Input className="h-9" type="number" value={form.saleableArea} onChange={(e) => set("saleableArea", e.target.value)} />
            </Field>
            <Field label="Balcony">
              <Input className="h-9" type="number" value={form.balconyArea} onChange={(e) => set("balconyArea", e.target.value)} />
            </Field>
            <Field label="Facing">
              <Select value={form.facing || "none"} onValueChange={(v) => set("facing", v === "none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Facing" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {["East", "West", "North", "South", "North-East", "North-West", "South-East", "South-West"].map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Parking">
              <Input className="h-9" value={form.parking} onChange={(e) => set("parking", e.target.value)} />
            </Field>
            <Field label="Base price">
              <Input className="h-9" type="number" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
            </Field>
            <Field label="PLC">
              <Input className="h-9" type="number" value={form.plc} onChange={(e) => set("plc", e.target.value)} />
            </Field>
            <Field label="Other charges">
              <Input className="h-9" type="number" value={form.otherCharges} onChange={(e) => set("otherCharges", e.target.value)} />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <Textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-1.5 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={save.isPending || !form.unitNumber}>
                {save.isPending ? "Saving…" : "Save unit"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading unit…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
