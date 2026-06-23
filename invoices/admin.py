from django.contrib import admin

from invoices.models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("number_display", "client_name", "gross_value", "status", "issue_date")
    list_filter = ("status",)
    search_fields = ("client_name", "client_document")
    readonly_fields = ("number", "created_at", "updated_at")
