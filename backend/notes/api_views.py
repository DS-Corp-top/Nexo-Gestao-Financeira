from rest_framework import viewsets

from common.api_mixins import TenantQuerySetMixin
from notes.models import Note
from notes.serializers import NoteSerializer


class NoteViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Note.objects.all()
    serializer_class = NoteSerializer
    search_fields = ("title", "content")
    filterset_fields = ("is_pinned", "color")
    ordering_fields = ("created_at", "updated_at", "is_pinned", "title")
    ordering = ("-is_pinned", "-updated_at")
    pagination_class = None
