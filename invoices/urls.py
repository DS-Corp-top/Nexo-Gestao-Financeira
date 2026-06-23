from django.urls import path

from invoices.views import (
    ClientCreateView,
    ClientListView,
    ClientPrefillView,
    ClientSearchView,
    CnpjLookupView,
    InvoiceCancelView,
    InvoiceCreateView,
    InvoiceDeleteView,
    InvoiceDetailView,
    InvoiceListView,
    InvoicePayView,
    InvoiceUpdateView,
)

app_name = "invoices"

urlpatterns = [
    path("", InvoiceListView.as_view(), name="list"),
    path("nova/", InvoiceCreateView.as_view(), name="create"),
    path("<int:pk>/", InvoiceDetailView.as_view(), name="detail"),
    path("<int:pk>/editar/", InvoiceUpdateView.as_view(), name="update"),
    path("<int:pk>/excluir/", InvoiceDeleteView.as_view(), name="delete"),
    path("<int:pk>/pagar/", InvoicePayView.as_view(), name="pay"),
    path("<int:pk>/cancelar/", InvoiceCancelView.as_view(), name="cancel"),
    path("clientes/", ClientListView.as_view(), name="client-list"),
    path("clientes/buscar/", ClientSearchView.as_view(), name="client-search"),
    path("clientes/<int:pk>/pre-preencher/", ClientPrefillView.as_view(), name="client-prefill"),
    path("clientes/novo/", ClientCreateView.as_view(), name="client-create"),
    path("cnpj/<str:cnpj>/", CnpjLookupView.as_view(), name="cnpj-lookup"),
]
