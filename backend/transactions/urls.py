from django.urls import path

from transactions.views import (
    QuickTransactionCreateView,
    StatementBalancePartialView,
    StatementPartialView,
    StatementView,
    TransactionCreateView,
    TransactionDeleteView,
    TransactionToggleClearedView,
    TransactionToggleIgnoredView,
    TransactionUpdateView,
)

app_name = "transactions"

urlpatterns = [
    path("", StatementView.as_view(), name="statement"),
    path("partial/", StatementPartialView.as_view(), name="statement-partial"),
    path("summary/", StatementBalancePartialView.as_view(), name="statement-summary-partial"),
    path("new/", TransactionCreateView.as_view(), name="create"),
    path("quick-add/", QuickTransactionCreateView.as_view(), name="quick-add"),
    path("<int:pk>/edit/", TransactionUpdateView.as_view(), name="update"),
    path("<int:pk>/delete/", TransactionDeleteView.as_view(), name="delete"),
    path("<int:pk>/toggle-cleared/", TransactionToggleClearedView.as_view(), name="toggle-cleared"),
    path("<int:pk>/toggle-ignored/", TransactionToggleIgnoredView.as_view(), name="toggle-ignored"),
]
