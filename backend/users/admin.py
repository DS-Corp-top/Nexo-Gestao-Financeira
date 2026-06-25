from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from users.forms import AdminUserChangeForm, AdminUserCreationForm


User = get_user_model()


@admin.action(description="Validar e ativar usuarios selecionados")
def approve_selected_users(modeladmin, request, queryset):
    updated = queryset.filter(is_active=False).update(is_active=True)
    modeladmin.message_user(
        request,
        f"{updated} cadastro(s) validado(s) e ativado(s).",
        level=messages.SUCCESS,
    )


try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    add_form = AdminUserCreationForm
    form = AdminUserChangeForm
    actions = (approve_selected_users,)
    list_display = (
        "username",
        "email",
        "is_active",
        "is_staff",
        "date_joined",
        "last_login",
    )
    list_filter = ("is_active", "is_staff", "is_superuser", "groups")
    ordering = ("-date_joined",)
    search_fields = ("username", "email", "first_name", "last_name")
