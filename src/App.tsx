import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PartnerShell } from "@/components/layout/partner-shell";
import { ProjectRedirect } from "@/components/layout/project-redirect";
import { ProjectWorkspace } from "@/components/layout/project-workspace";
import { PlatformShell } from "@/components/layout/platform-shell";
import { TenantLayout } from "@/components/layout/tenant-layout";
import {
  PartnerProtectedRoute,
  PlatformProtectedRoute,
  ProtectedRoute,
} from "@/components/layout/protected";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { CompaniesPage } from "@/pages/companies/list";
import { CompanyDetailPage } from "@/pages/companies/detail";
import { CompanyFormPage } from "@/pages/companies/form";
import { ProjectsListPage } from "@/pages/projects/list";
import { ProjectFormPage } from "@/pages/projects/form";
import { ProjectSetupPage } from "@/pages/projects/setup";
import { ProjectOverviewPage } from "@/pages/projects/overview";
import { InventoryViewPage } from "@/pages/inventory/view";
import { UnitMasterPage } from "@/pages/inventory/list";
import { UnitFormPage } from "@/pages/inventory/form";
import { BookingsListPage } from "@/pages/bookings/list";
import { BookingFormPage } from "@/pages/bookings/form";
import { BookingDetailPage } from "@/pages/bookings/detail";
import { CustomersPage } from "@/pages/customers/list";
import { PartnersListPage } from "@/pages/partners/list";
import { PartnerDashboardPage } from "@/pages/partners/dashboard";
import { PaymentsPage } from "@/pages/payments/list";
import { UsersPage } from "@/pages/users/list";
import { MastersPage } from "@/pages/masters";
import { ReportsPage } from "@/pages/reports";
import { SettingsGeneralPage } from "@/pages/settings";
import { DatabasePage } from "@/pages/database";
import { BulkUploadPage } from "@/pages/bulk-upload";
import { SettingsWorkspace } from "@/components/layout/settings-workspace";
import { DocumentsPage } from "@/pages/documents";
import { CrmPage } from "@/pages/crm";
import { InvoiceViewPage } from "@/pages/invoices/view";
import { PartnerLoginPage } from "@/pages/partner-portal/login";
import { PartnerPortalHome } from "@/pages/partner-portal/home";
import { PartnerPortalBookings } from "@/pages/partner-portal/bookings";
import { PartnerPortalBookingDetail } from "@/pages/partner-portal/booking-detail";
import { PartnerPortalDocuments } from "@/pages/partner-portal/documents";
import { PlatformLoginPage } from "@/pages/platform/login";
import { PlatformAccountsPage } from "@/pages/platform/accounts";
import { PlatformAccountCreatePage } from "@/pages/platform/account-form";
import { PlatformAccountDetailPage } from "@/pages/platform/account-detail";
import { PlatformPlansPage } from "@/pages/platform/plans";
import { getTenantSlug } from "@/lib/tenant";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ChannelPartnerRedirect() {
  const { id } = useParams();
  return <Navigate to={`settings/channel-partners/${id}`} replace />;
}

function EntryRedirect() {
  const slug = getTenantSlug();
  if (slug) return <Navigate to={`/t/${slug}`} replace />;
  return <Navigate to="/login" replace />;
}

/** Shared staff + settings routes (relative under parent path). */
function StaffAppRoutes() {
  return (
    <>
      <Route index element={<DashboardPage />} />
      <Route path="companies" element={<CompaniesPage />} />
      <Route path="companies/new" element={<CompanyFormPage />} />
      <Route path="companies/:companyId/projects/new" element={<ProjectFormPage />} />
      <Route path="companies/:companyId/projects" element={<ProjectsListPage />} />
      <Route path="companies/:id/edit" element={<CompanyFormPage />} />
      <Route path="companies/:id" element={<CompanyDetailPage />} />
      <Route path="projects" element={<ProjectsListPage />} />
      <Route path="projects/new" element={<ProjectFormPage />} />
      <Route path="projects/:id/edit" element={<ProjectFormPage />} />
      <Route path="projects/:id/setup" element={<ProjectSetupPage />} />
      <Route path="projects/:id/units" element={<UnitMasterPage />} />
      <Route path="projects/:id/units/new" element={<UnitFormPage />} />
      <Route path="projects/:id/units/:unitId/edit" element={<UnitFormPage />} />
      <Route path="projects/:id" element={<ProjectWorkspace />}>
        <Route index element={<ProjectOverviewPage />} />
        <Route path="inventory" element={<InventoryViewPage />} />
        <Route path="bookings" element={<BookingsListPage />} />
        <Route path="receipts" element={<PaymentsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="crm" element={<CrmPage />} />
      </Route>
      <Route path="inventory" element={<ProjectRedirect suffix="inventory" />} />
      <Route path="bookings" element={<ProjectRedirect suffix="bookings" />} />
      <Route path="payments" element={<ProjectRedirect suffix="receipts" />} />
      <Route path="bookings/new" element={<BookingFormPage />} />
      <Route path="bookings/:id" element={<BookingDetailPage />} />
      <Route path="invoices/:id" element={<InvoiceViewPage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="settings" element={<SettingsWorkspace />}>
        <Route index element={<SettingsGeneralPage />} />
        <Route path="channel-partners" element={<PartnersListPage />} />
        <Route path="channel-partners/:id" element={<PartnerDashboardPage />} />
        <Route path="masters" element={<MastersPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="bulk-upload" element={<BulkUploadPage />} />
        <Route path="database" element={<DatabasePage />} />
      </Route>
      <Route path="channel-partners" element={<Navigate to="settings/channel-partners" replace />} />
      <Route path="channel-partners/:id" element={<ChannelPartnerRedirect />} />
      <Route path="masters" element={<Navigate to="settings/masters" replace />} />
      <Route path="users" element={<Navigate to="settings/users" replace />} />
      <Route path="approvals" element={<Navigate to="settings" replace />} />
      <Route path="marketing" element={<Navigate to="settings" replace />} />
      <Route path="integrations" element={<Navigate to="settings" replace />} />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Platform control plane */}
          <Route path="/admin/login" element={<PlatformLoginPage />} />
          <Route element={<PlatformProtectedRoute />}>
            <Route path="/admin" element={<PlatformShell />}>
              <Route index element={<PlatformAccountsPage />} />
              <Route path="accounts/new" element={<PlatformAccountCreatePage />} />
              <Route path="accounts/:id" element={<PlatformAccountDetailPage />} />
              <Route path="plans" element={<PlatformPlansPage />} />
            </Route>
          </Route>

          {/* Legacy single-tenant (LEGACY_SINGLE_DB) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/partner/login" element={<PartnerLoginPage />} />
          <Route element={<PartnerProtectedRoute />}>
            <Route element={<PartnerShell />}>
              <Route path="/partner" element={<PartnerPortalHome />} />
              <Route path="/partner/bookings" element={<PartnerPortalBookings />} />
              <Route path="/partner/bookings/:id" element={<PartnerPortalBookingDetail />} />
              <Route path="/partner/documents" element={<PartnerPortalDocuments />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppShell />}>
              {StaffAppRoutes()}
            </Route>
          </Route>

          {/* Multi-tenant workspaces */}
          <Route path="/t/:slug" element={<TenantLayout />}>
            <Route path="login" element={<Navigate to="/login" replace />} />
            <Route path="partner/login" element={<PartnerLoginPage />} />
            <Route element={<PartnerProtectedRoute />}>
              <Route element={<PartnerShell />}>
                <Route path="partner" element={<PartnerPortalHome />} />
                <Route path="partner/bookings" element={<PartnerPortalBookings />} />
                <Route path="partner/bookings/:id" element={<PartnerPortalBookingDetail />} />
                <Route path="partner/documents" element={<PartnerPortalDocuments />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                {StaffAppRoutes()}
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<EntryRedirect />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
