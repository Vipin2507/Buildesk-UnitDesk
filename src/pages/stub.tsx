import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { EmptyState } from "@/components/shared/empty-state";
import { Construction } from "lucide-react";

export function StubPage({ title, blurb }: { title: string; blurb: string }) {
  return (
    <PageWrap>
      <PageHeader title={title} subtitle="Phase 2 — UI stub" />
      <EmptyState icon={Construction} title={blurb} />
    </PageWrap>
  );
}
