from django.contrib import admin

from livestock.models import CattleLot, CattleLotEntry


class CattleLotEntryInline(admin.TabularInline):
    model = CattleLotEntry
    extra = 0
    fields = ("entry_type", "date", "amount", "head_count", "weight_kg", "description")


@admin.register(CattleLot)
class CattleLotAdmin(admin.ModelAdmin):
    list_display = ("name", "system", "status", "start_date", "end_date", "tenant")
    list_filter = ("system", "status")
    search_fields = ("name", "location")
    inlines = [CattleLotEntryInline]


@admin.register(CattleLotEntry)
class CattleLotEntryAdmin(admin.ModelAdmin):
    list_display = ("lot", "entry_type", "date", "amount", "head_count")
    list_filter = ("entry_type",)
