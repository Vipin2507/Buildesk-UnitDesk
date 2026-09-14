import { useParams } from "react-router-dom";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { CardSoft } from "@/components/shared/card-soft";
import { PageHeader } from "@/components/shared/page-header";
import { PageWrap } from "@/components/shared/page-wrap";
import { useProjectContextStore } from "@/stores/project-context";

export function DocumentsPage() {
  const { id } = useParams();
  const contextId = useProjectContextStore((s) => s.projectId);
  const projectId = id ?? contextId ?? "";

  return (
    <PageWrap>
      <PageHeader
        title="Documents"
        subtitle="KYC, agreements, receipts and unit files"
        breadcrumbs={projectId ? [{ label: "Project", to: `/projects/${projectId}` }, { label: "Documents" }] : undefined}
      />
      <CardSoft className="max-w-3xl">
        {projectId ? (
          <DocumentsPanel projectId={projectId} entityType="project" entityId={projectId} />
        ) : (
          <p className="text-xs text-muted-foreground">Open a project to attach documents.</p>
        )}
      </CardSoft>
    </PageWrap>
  );
}
