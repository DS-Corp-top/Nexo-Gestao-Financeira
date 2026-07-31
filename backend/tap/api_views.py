from rest_framework import viewsets

from common.api_mixins import TenantQuerySetMixin
from tap.models import ProjectCharter
from tap.serializers import ProjectCharterSerializer


class ProjectCharterViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ProjectCharter.objects.select_related("project")
    serializer_class = ProjectCharterSerializer
    filterset_fields = ("project", "status")
    search_fields = ("project__name", "sponsor_name", "project_manager_name")
    ordering_fields = ("number", "created_at")
    ordering = ("-number",)
    pagination_class = None
