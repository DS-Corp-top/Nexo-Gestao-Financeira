from django.urls import path

from dashboard.views import (
    DashboardChartsView,
    DashboardHomeView,
)

app_name = "dashboard"

urlpatterns = [
    path("", DashboardHomeView.as_view(), name="home"),
    path("dashboard/charts/", DashboardChartsView.as_view(), name="charts"),
]
