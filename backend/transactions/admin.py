from django.contrib import admin

from transactions.models import ClosedMonth, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "date",
        "transaction_type",
        "amount",
        "account",
        "destination_account",
        "category",
        "user",
    )
    list_filter = ("transaction_type", "date", "recurrence_type")
    search_fields = ("description", "account__name", "user__username")


@admin.register(ClosedMonth)
class ClosedMonthAdmin(admin.ModelAdmin):
    list_display = ("year", "month", "is_closed", "user", "closed_at")
    list_filter = ("is_closed", "year", "month")
    search_fields = ("user__username",)
