from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import TenantQuerySetMixin, get_user_tenant, is_view_only_superuser
from tenants.models import TenantMembership
from todos.models import Project, TodoAttachment, TodoItem
from todos.serializers import ProjectSerializer, TodoAttachmentSerializer, TodoItemSerializer


class TenantMembersView(APIView):
    """Lightweight list of users in the current tenant for task assignment."""

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        if is_view_only_superuser(request.user, tenant):
            return Response([])
        memberships = (
            TenantMembership.objects
            .filter(tenant=tenant)
            .select_related("user")
            .order_by("user__first_name", "user__email")
        )
        data = []
        for m in memberships:
            u = m.user
            name = u.get_full_name().strip() or u.email or u.username
            data.append({"id": u.id, "name": name, "email": u.email})
        return Response(data)


class ProjectViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    filterset_fields = ("is_finished",)
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    ordering = ("name",)
    pagination_class = None



class TodoItemViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = TodoItem.objects.select_related("assigned_to", "parent").prefetch_related(
        Prefetch(
            "subtasks",
            queryset=TodoItem.objects.select_related("assigned_to").order_by("is_done", "-created_at"),
        )
    )
    serializer_class = TodoItemSerializer
    filterset_fields = ("is_done", "priority", "status", "project", "assigned_to", "parent", "is_archived")
    search_fields = ("title", "description")
    ordering_fields = ("created_at", "due_date", "priority", "title")
    ordering = ("is_done", "-created_at")
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list" and "parent" not in self.request.query_params:
            queryset = queryset.filter(parent__isnull=True)
        return queryset

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        item = self.get_object()
        item.toggle()
        item.save(update_fields=["status", "is_done", "done_at", "is_archived", "archived_at", "updated_at"])
        return Response(TodoItemSerializer(item).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """Persist the card order (and column) for a Kanban column after a drag-and-drop.

        Body: {"status": "pending", "ordered_ids": [3, 1, 2]}
        Every id becomes part of `status`, in the given order.
        """
        target_status = request.data.get("status")
        ordered_ids = request.data.get("ordered_ids")

        if target_status not in TodoItem.Status.values:
            return Response({"detail": "Status invalido."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return Response({"detail": "ordered_ids deve ser uma lista nao vazia."}, status=status.HTTP_400_BAD_REQUEST)
        if len(ordered_ids) != len(set(ordered_ids)):
            return Response({"detail": "ordered_ids nao pode conter ids duplicados."}, status=status.HTTP_400_BAD_REQUEST)

        items = list(self.get_queryset().filter(id__in=ordered_ids))
        items_by_id = {item.id: item for item in items}
        if len(items_by_id) != len(set(ordered_ids)):
            return Response({"detail": "Alguma tarefa nao foi encontrada."}, status=status.HTTP_400_BAD_REQUEST)

        changed = []
        for index, item_id in enumerate(ordered_ids):
            item = items_by_id[item_id]
            if item.order != index or item.status != target_status:
                item.order = index
                item.status = target_status
                item.is_done = target_status == TodoItem.Status.DONE
                if item.is_done and item.done_at is None:
                    item.done_at = timezone.now()
                elif not item.is_done:
                    item.done_at = None
                changed.append(item)

        if changed:
            TodoItem.objects.bulk_update(changed, ["order", "status", "is_done", "done_at", "updated_at"])

        return Response(TodoItemSerializer(items_by_id.values(), many=True).data)


class TodoAttachmentViewSet(
    TenantQuerySetMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Upload/list/delete de anexos de tarefa. Sem update — um anexo não é
    editável, só substituível (excluir e reenviar)."""

    queryset = TodoAttachment.objects.select_related("user", "todo")
    serializer_class = TodoAttachmentSerializer
    filterset_fields = ("todo",)
    pagination_class = None
