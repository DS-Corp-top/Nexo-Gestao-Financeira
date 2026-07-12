from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Document, Folder
from .serializers import DocumentSerializer, FolderSerializer
from common.api_mixins import TenantQuerySetMixin

class FolderViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
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

class DocumentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
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
        
        # Se 'folder' vier na querystring, filtra pela pasta específica.
        # Caso contrário, mostra apenas documentos da raiz (que não estão em nenhuma pasta).
        folder_id = self.request.query_params.get("folder")
        if folder_id:
            qs = qs.filter(folder_id=folder_id)
        else:
            qs = qs.filter(folder__isnull=True)
            
        return qs
