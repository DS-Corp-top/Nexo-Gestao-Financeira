from django.urls import path

from accounts.views import (
    AccountCreateView,
    AccountDeleteView,
    AccountListView,
    AccountUpdateView,
    CreditLimitUpdateView,
)

app_name = "accounts"

urlpatterns = [
    path("", AccountListView.as_view(), name="list"),
    path("new/", AccountCreateView.as_view(), name="create"),
    path("<int:pk>/edit/", AccountUpdateView.as_view(), name="update"),
    path("<int:pk>/delete/", AccountDeleteView.as_view(), name="delete"),
    path("credit-limit/", CreditLimitUpdateView.as_view(), name="credit-limit"),
]
