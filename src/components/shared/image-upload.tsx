import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export function ImageUpload({
  value,
  onChange,
  label,
  hint = "JPG, PNG or WebP · drag & drop or click · up to 10 MB",
  variant = "cover",
  className,
  compact,
  fallback,
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  variant?: "logo" | "cover" | "plan";
  className?: string;
  compact?: boolean;
  /** Shown when value is empty (e.g. default project render). */
  fallback?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const display = value || fallback || null;
  const isCustom = Boolean(value);

  async function pick(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ url: string }>("/api/uploads/image", fd);
      onChange(res.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <p className="text-xs font-medium">{label}</p> : null}
      <div
        className={cn(
          "group relative overflow-hidden rounded-lg border bg-muted/40 transition-colors",
          dragging && "border-primary bg-primary/5",
          variant === "logo" && (compact ? "h-16 w-16" : "h-24 w-24"),
          variant === "plan" && (compact ? "h-20 w-full" : "h-28 w-full max-w-xs"),
          variant === "cover" && (compact ? "h-24 w-full" : "h-32 w-full max-w-sm"),
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        {display ? (
          <img src={display} alt="" className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/70"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <span className="px-2 text-center text-[11px]">{busy ? "Uploading…" : "Add image"}</span>
          </button>
        )}
        {display ? (
          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="h-7 w-7 bg-card/90"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label="Replace image"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            </Button>
            {isCustom ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="h-7 w-7 bg-card/90"
                onClick={() => onChange(null)}
                aria-label="Reset to default"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {hint && !compact ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
