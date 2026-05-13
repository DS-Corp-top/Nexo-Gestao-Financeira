from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import FieldDoesNotExist


def model_has_field(model, field_name):
    try:
        model._meta.get_field(field_name)
    except FieldDoesNotExist:
        return False
    return True


class UserQuerySetMixin(LoginRequiredMixin):
    owner_field = "user"
    tenant_field = "tenant"

    def get_queryset(self):
        queryset = super().get_queryset()
        if model_has_field(queryset.model, self.tenant_field) and getattr(self.request, "tenant", None):
            return queryset.filter(**{self.tenant_field: self.request.tenant})
        return queryset.filter(**{self.owner_field: self.request.user})


class UserAssignMixin(LoginRequiredMixin):
    owner_field = "user"
    tenant_field = "tenant"

    def form_valid(self, form):
        if model_has_field(form.instance.__class__, self.owner_field):
            setattr(form.instance, self.owner_field, self.request.user)
        if model_has_field(form.instance.__class__, self.tenant_field) and getattr(self.request, "tenant", None):
            setattr(form.instance, self.tenant_field, self.request.tenant)
        return super().form_valid(form)
