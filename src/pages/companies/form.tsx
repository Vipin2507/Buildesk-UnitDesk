import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { Field } from "@/components/shared/field";
import { CardSoft } from "@/components/shared/card-soft";
import { ImageUpload } from "@/components/shared/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useState, useEffect } from "react";

type Company = {
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  gst?: string | null;
  pan?: string | null;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  status: string;
};

const empty: Company = {
  name: "",
  code: "",
  address: "",
  city: "",
  state: "",
  gst: "",
  pan: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  logoUrl: null,
  status: "active",
};

export function CompanyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id) && id !== "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Company>(empty);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const { data } = useQuery({
    queryKey: id ? qk.company(id) : ["company-new"],
    queryFn: () => api.get<Company>(`/api/companies/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (data) setForm({ ...empty, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      isEdit ? api.patch(`/api/companies/${id}`, form) : api.post("/api/companies", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companies });
      if (isEdit) qc.invalidateQueries({ queryKey: qk.company(id!) });
      toast.success(isEdit ? "Company updated" : "Company created");
      navigate(isEdit ? `/companies/${id}` : "/companies");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    },
  });

  const set = (k: keyof Company, v: string | null) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <PageWrap>
      <PageHeader
        title={isEdit ? "Edit company" : "Add company"}
        subtitle="Company master with branding and contacts"
        breadcrumbs={[
          { label: "Companies", to: "/companies" },
          { label: isEdit ? "Edit" : "New" },
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
              label="Company logo"
              variant="logo"
              value={form.logoUrl}
              onChange={(url) => set("logoUrl", url)}
            />
          </div>
          <Field label="Company name" error={errors.name?.[0]}>
            <Input className="h-10" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Code" error={errors.code?.[0]}>
            <Input className="h-10" value={form.code} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="City">
            <Input className="h-8" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <Input className="h-8" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input className="h-8" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="GST">
            <Input className="h-8" value={form.gst ?? ""} onChange={(e) => set("gst", e.target.value)} />
          </Field>
          <Field label="PAN">
            <Input className="h-8" value={form.pan ?? ""} onChange={(e) => set("pan", e.target.value)} />
          </Field>
          <Field label="Contact person">
            <Input className="h-8" value={form.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} />
          </Field>
          <Field label="Contact number">
            <Input className="h-8" value={form.contactNumber ?? ""} onChange={(e) => set("contactNumber", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input className="h-8" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-1.5 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate("/companies")}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              Save company
            </Button>
          </div>
        </form>
      </CardSoft>
    </PageWrap>
  );
}
