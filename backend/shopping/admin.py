from django.contrib import admin

from shopping.models import ShoppingItem, ShoppingList


@admin.register(ShoppingList)
class ShoppingListAdmin(admin.ModelAdmin):
    list_display = ("name", "list_date", "user", "updated_at")
    search_fields = ("name", "notes", "user__username")


@admin.register(ShoppingItem)
class ShoppingItemAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "shopping_list",
        "user",
        "quantity",
        "unit_price",
        "is_purchased",
        "updated_at",
    )
    list_filter = ("shopping_list", "is_purchased")
    search_fields = ("title", "notes", "shopping_list__name", "user__username")
