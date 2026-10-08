import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PartnerShell } from "@/components/layout/partner-shell";
import { ProjectRedirect } from "@/components/layout/project-redirect";
import { ProjectWorkspace } from "@/components/layout/project-workspace";
import { PartnerProtectedRoute, ProtectedRoute } from "@/components/layout/protected";
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
import { SettingsPage } from "@/pages/settings";
import { DocumentsPage } from "@/pages/documents";
import { CrmPage } from "@/pages/crm";
import { MarketingPage } from "@/pages/marketing";
import { IntegrationsPage } from "@/pages/integrations";
import { ApprovalsPage } from "@/pages/approvals";
import { InvoiceViewPage } from "@/pages/invoices/view";
import { PartnerLoginPage } from "@/pages/partner-portal/login";
import { PartnerPortalHome } from "@/pages/partner-portal/home";
import { PartnerPortalBookings } from "@/pages/partner-portal/bookings";
import { PartnerPortalBookingDetail } from "@/pages/partner-portal/booking-detail";
import { PartnerPortalDocuments } from "@/pages/partner-portal/documents";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/companies/new" element={<CompanyFormPage />} />
              <Route path="/companies/:companyId/projects/new" element={<ProjectFormPage />} />
              <Route path="/companies/:companyId/projects" element={<ProjectsListPage />} />
              <Route path="/companies/:id/edit" element={<CompanyFormPage />} />
              <Route path="/companies/:id" element={<CompanyDetailPage />} />
              <Route path="/projects" element={<ProjectsListPage />} />
              <Route path="/projects/new" element={<ProjectFormPage />} />

              {/* Project forms / setup stay outside workspace tabs */}
              <Route path="/projects/:id/edit" element={<ProjectFormPage />} />
              <Route path="/projects/:id/setup" element={<ProjectSetupPage />} />
              <Route path="/projects/:id/units" element={<UnitMasterPage />} />
              <Route path="/projects/:id/units/new" element={<UnitFormPage />} />
              <Route path="/projects/:id/units/:unitId/edit" element={<UnitFormPage />} />

              <Route path="/projects/:id" element={<ProjectWorkspace />}>
                <Route index element={<ProjectOverviewPage />} />
                <Route path="inventory" element={<InventoryViewPage />} />
                <Route path="bookings" element={<BookingsListPage />} />
                <Route path="receipts" element={<PaymentsPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="crm" element={<CrmPage />} />
              </Route>

              {/* Legacy global routes → project workspace */}
              <Route path="/inventory" element={<ProjectRedirect suffix="inventory" />} />
              <Route path="/bookings" element={<ProjectRedirect suffix="bookings" />} />
              <Route path="/payments" element={<ProjectRedirect suffix="receipts" />} />

              <Route path="/bookings/new" element={<BookingFormPage />} />
              <Route path="/bookings/:id" element={<BookingDetailPage />} />
              <Route path="/invoices/:id" element={<InvoiceViewPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/channel-partners" element={<PartnersListPage />} />
              <Route path="/channel-partners/:id" element={<PartnerDashboardPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/masters" element={<MastersPage />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
