from rest_framework import serializers

from tap.models import ProjectCharter


class ProjectCharterSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    number_display = serializers.CharField(read_only=True)

    class Meta:
        model = ProjectCharter
        fields = (
            "id",
            "project", "project_name",
            "number", "number_display",
            "status", "status_display",
            "justification", "objectives", "scope", "technologies", "deliverables",
            "assumptions", "constraints", "risks", "stakeholders",
            "sponsor_name", "project_manager_name", "co_responsibles",
            "start_date", "end_date", "estimated_budget",
            "approved_at", "approved_by_name",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "project_name", "number", "number_display", "status_display",
            "created_at", "updated_at",
        )

    def validate_project(self, value):
        tenant = self.context.get("tenant")
        if tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Projeto inválido para este tenant.")
        return value
