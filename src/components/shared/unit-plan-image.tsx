import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Floor-plan preview with optional replace / clear (clears custom upload only). */
export function UnitPlanImage({
  src,
  alt = "Floor plan",
  className,
  editable,
  isCustom,
  onChange,
  size = "md",
  fit = "cover",
}: {
  src: string;
  alt?: string;
  className?: string;
  editable?: boolean;
  isCustom?: boolean;
  onChange?: (url: string | null) => void;
  /** Omit size presets when className fully controls dimensions. */
  size?: "sm" | "md" | "lg" | "fill";
  fit?: "cover" | "contain";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file?: File | null) {
    if (!file || !onChange) return;
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
      toast.success("Floor plan updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/40",
        size === "sm" && "h-16 w-16",
        size === "md" && "aspect-square w-full",
        size === "lg" && "aspect-[4/3] w-full",
        size === "fill" && "h-full w-full",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn("h-full w-full", fit === "contain" ? "object-contain p-1" : "object-cover")}
      />
      {editable && onChange ? (
        <>
          <div className="absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/35 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="h-7 w-7 bg-card/95"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              aria-label="Replace floor plan"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            </Button>
            {isCustom ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="h-7 w-7 bg-card/95"
                onClick={() => onChange(null)}
                aria-label="Reset to type plan"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </>
      ) : null}
    </div>
  );
}
