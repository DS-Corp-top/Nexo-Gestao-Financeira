from rest_framework import viewsets

from categories.models import Category
from categories.serializers import CategorySerializer
from common.api_mixins import TenantQuerySetMixin


class CategoryViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    search_fields = ("name",)
    filterset_fields = ("category_type",)
    ordering_fields = ("name", "category_type")
    ordering = ("category_type", "name")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())
