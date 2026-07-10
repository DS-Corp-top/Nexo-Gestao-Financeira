"""API v1 URL configuration.

All endpoints are mounted under /api/v1/ by the main urls.py.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from users.api_views import CookieTokenRefreshView as TokenRefreshView

from accounts.api_views import AccountViewSet, CardMonthlyLimitViewSet
from categories.api_views import CategoryViewSet
from dashboard.api_views import DashboardView
from investments.api_views import BacenBanksView, InvestmentEntryViewSet, InvestmentExchangeRatesView, InvestmentViewSet
from invoices.api_views import ClientViewSet, InvoiceViewSet
from shopping.api_views import ShoppingItemViewSet, ShoppingListViewSet
from tenants.api_views import (
    CepLookupView,
    TenantCompanyViewSet,
    TenantInviteUserView,
    TenantMembershipViewSet,
    TenantProfileView,
    TenantResetView,
)
from notes.api_views import NoteListViewSet, NoteSubtaskViewSet, NoteViewSet
from notifications.api_views import PushSubscribeView, PushUnsubscribeView, VapidPublicKeyView
from drive.api_views import DocumentViewSet, FolderViewSet
from reports.api_views import DREReportView, InvestmentsReportView, SummaryReportView, TransactionsReportView
from todos.api_views import ProjectViewSet, TenantMembersView, TodoItemViewSet
from transactions.api_views import ClosedMonthViewSet, TransactionViewSet
from users.api_views import (
    ApproveUserView,
    LogoutView,
    MeView,
    PendingUsersView,
    RateLimitedTokenObtainPairView,
    RegisterAPIView,
    RestoreBackupView,
    SystemAllCompaniesView,
    SystemCompanyDetailView,
    SystemStatsView,
    SystemTenantDetailView,
    SystemTenantsView,
    SystemUserDetailView,
    SystemUsersView,
)

router = DefaultRouter()
router.register("accounts", AccountViewSet)
router.register("card-limits", CardMonthlyLimitViewSet)
router.register("categories", CategoryViewSet)
router.register("transactions", TransactionViewSet)
router.register("closed-months", ClosedMonthViewSet)
router.register("invoices", InvoiceViewSet)
router.register("clients", ClientViewSet)
router.register("shopping-lists", ShoppingListViewSet)
router.register("shopping-items", ShoppingItemViewSet)
router.register("investments", InvestmentViewSet)
router.register("investment-entries", InvestmentEntryViewSet)
router.register("tenant-memberships", TenantMembershipViewSet, basename="tenant-membership")
router.register("tenant-companies", TenantCompanyViewSet, basename="tenant-company")
router.register("todo-projects", ProjectViewSet, basename="todo-project")
router.register("todos", TodoItemViewSet, basename="todo")
router.register("note-lists", NoteListViewSet, basename="note-list")
router.register("notes", NoteViewSet, basename="note")
router.register("note-subtasks", NoteSubtaskViewSet, basename="note-subtask")
router.register("drive/folders", FolderViewSet, basename="folder")
router.register("drive/documents", DocumentViewSet, basename="document")

app_name = "api"

urlpatterns = [
    # Auth
    path("auth/token/", RateLimitedTokenObtainPairView.as_view(), name="token_obtain"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/register/", RegisterAPIView.as_view(), name="register"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),

    # Current user
    path("me/", MeView.as_view(), name="me"),

    # User management (superuser only)
    path("users/pending/", PendingUsersView.as_view(), name="users_pending"),
    path("users/<int:pk>/approve/", ApproveUserView.as_view(), name="users_approve"),
    path("system/restore-backup/", RestoreBackupView.as_view(), name="restore_backup"),
    path("system/stats/", SystemStatsView.as_view(), name="system_stats"),
    path("system/tenants/", SystemTenantsView.as_view(), name="system_tenants"),
    path("system/tenants/<int:pk>/", SystemTenantDetailView.as_view(), name="system_tenant_detail"),
    path("system/users/", SystemUsersView.as_view(), name="system_users"),
    path("system/users/<int:pk>/", SystemUserDetailView.as_view(), name="system_user_detail"),
    path("system/all-companies/", SystemAllCompaniesView.as_view(), name="system_all_companies"),
    path("system/companies/<int:pk>/", SystemCompanyDetailView.as_view(), name="system_company_detail"),

    # Dashboard
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("investments/exchange-rates/", InvestmentExchangeRatesView.as_view(), name="investment_exchange_rates"),
    path("investments/bacen-banks/", BacenBanksView.as_view(), name="investment_bacen_banks"),

    # Tenant profile
    path("tenant/", TenantProfileView.as_view(), name="tenant_profile"),
    path("tenant/invite-user/", TenantInviteUserView.as_view(), name="tenant_invite_user"),
    path("tenant/members/", TenantMembersView.as_view(), name="tenant_members"),
    path("tenant/reset/", TenantResetView.as_view(), name="tenant_reset"),

    # CEP lookup
    path("cep/<str:cep>/", CepLookupView.as_view(), name="cep_lookup"),

    # Web Push notifications
    path("push/vapid-public-key/", VapidPublicKeyView.as_view(), name="push_vapid_public_key"),
    path("push/subscribe/", PushSubscribeView.as_view(), name="push_subscribe"),
    path("push/unsubscribe/", PushUnsubscribeView.as_view(), name="push_unsubscribe"),

    # Reports
    path("reports/transactions/", TransactionsReportView.as_view(), name="report_transactions"),
    path("reports/summary/", SummaryReportView.as_view(), name="report_summary"),
    path("reports/investments/", InvestmentsReportView.as_view(), name="report_investments"),
    path("reports/dre/", DREReportView.as_view(), name="report_dre"),

    # Router-registered viewsets
    path("", include(router.urls)),
]
