import { useLocation } from "react-router-dom";
import { UnitDetailPanel } from "@/components/shared/unit-detail-panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDrilldownSheetStore } from "@/stores/drilldown";

const INVENTORY_PATH = /\/projects\/[^/]+\/inventory\/?$/;

export function DrilldownSheet() {
  const { entity, id, docked, close } = useDrilldownSheetStore();
  const location = useLocation();
  const onInventory = INVENTORY_PATH.test(location.pathname);
  const hideForDock = entity === "unit" && docked && onInventory;
  const open = entity === "unit" && Boolean(id) && !hideForDock;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent className="p-0">
        {open && id ? <UnitDetailPanel unitId={id} variant="sheet" onClose={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}
