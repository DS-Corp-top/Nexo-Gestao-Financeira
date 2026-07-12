from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Document, Folder, compute_file_hash
from .serializers import DocumentSerializer, FolderSerializer
from common.api_mixins import TenantQuerySetMixin


def _truthy(value) -> bool:
    return str(value).strip().lower() in ("1", "true", "yes", "on")


class TrashableViewSetMixin:
    """Soft-delete (30-day trash) support shared by Folder and Document.

    DELETE just flags the row; a daily Celery task
    (drive.tasks.purge_expired_trash) hard-deletes anything past 30 days in
    the trash. `trash`/`restore`/`purge` are the only actions that operate
    on already-trashed rows — everything else only ever sees active rows.
    """

    trash_actions = ("trash", "restore", "purge")

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action in self.trash_actions:
            return qs.filter(deleted_at__isnull=False)
        return qs.filter(deleted_at__isnull=True)

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=False, methods=["get"])
    def trash(self, request):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        instance = self.get_object()
        instance.restore()
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["delete"])
    def purge(self, request, pk=None):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FolderViewSet(TrashableViewSetMixin, TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["company"]
    search_fields = ["name"]
    ordering_fields = ["created_at", "name"]
    ordering = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()

        if self.action in self.trash_actions:
            return qs

        # Same convention as DocumentViewSet: explicit 'parent' shows that
        # folder's direct children; otherwise only root-level folders.
        parent_id = self.request.query_params.get("parent")
        if parent_id:
            qs = qs.filter(parent_id=parent_id)
        else:
            qs = qs.filter(parent__isnull=True)
        return qs

    def perform_create(self, serializer):
        # Folder has no `user` field (unlike Document), so it can't use the
        # mixin's default perform_create — that unconditionally passes
        # user=self.request.user, which Folder.objects.create() rejects.
        serializer.save(tenant=self.get_tenant())

class DocumentViewSet(TrashableViewSetMixin, TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["company", "folder"]
    search_fields = ["title", "file_type"]
    ordering_fields = ["created_at", "title", "file_size"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()

        if self.action in self.trash_actions:
            return qs

        # Se 'folder' vier na querystring, filtra pela pasta específica.
        # Caso contrário, mostra apenas documentos da raiz (que não estão em nenhuma pasta).
        folder_id = self.request.query_params.get("folder")
        if folder_id:
            qs = qs.filter(folder_id=folder_id)
        else:
            qs = qs.filter(folder__isnull=True)

        return qs

    def create(self, request, *args, **kwargs):
        file_obj = request.FILES.get("file")
        allow_duplicate = _truthy(request.data.get("allow_duplicate"))

        if file_obj and not allow_duplicate:
            file_hash = compute_file_hash(file_obj)
            existing = (
                Document.objects.filter(tenant=self.get_tenant(), content_hash=file_hash, deleted_at__isnull=True)
                .select_related("folder")
                .first()
            )
            if existing:
                return Response(
                    {
                        "duplicate": True,
                        "detail": "Já existe um arquivo idêntico no Drive.",
                        "existing_document": DocumentSerializer(existing, context=self.get_serializer_context()).data,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        return super().create(request, *args, **kwargs)
