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
