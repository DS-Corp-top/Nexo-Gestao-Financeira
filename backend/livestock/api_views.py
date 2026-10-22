from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from common.api_mixins import TenantQuerySetMixin
from livestock.models import CattleLot, CattleLotEntry
from livestock.serializers import (
    CattleLotEntrySerializer,
    CattleLotSerializer,
    CattleLotSummarySerializer,
)


class ModelValidationMixin:
    """Converte ValidationError do modelo (full_clean no save) em 400 da API."""

    def _save(self, serializer, **kwargs):
        try:
            serializer.save(**kwargs)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict) from exc

    def perform_create(self, serializer):
        self._save(serializer, user=self.request.user, tenant=self.get_tenant())

    def perform_update(self, serializer):
        self._save(serializer)


class CattleLotViewSet(ModelValidationMixin, TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = CattleLot.objects.prefetch_related("entries").all()
    search_fields = ("name", "location")
    filterset_fields = ("system", "status")
    ordering_fields = ("name", "start_date", "created_at")
    ordering = ("status", "-start_date", "name")

    def get_serializer_class(self):
        if self.action == "list":
            return CattleLotSummarySerializer
        return CattleLotSerializer


class CattleLotEntryViewSet(ModelValidationMixin, TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = CattleLotEntry.objects.select_related("lot").all()
    serializer_class = CattleLotEntrySerializer
    filterset_fields = ("lot", "entry_type")
    ordering_fields = ("date", "amount", "created_at")
    ordering = ("-date", "-created_at")

    def perform_destroy(self, instance):
        try:
            instance.validate_delete()
        except DjangoValidationError as exc:
            raise ValidationError({"detail": exc.messages[0]}) from exc
        instance.delete()
