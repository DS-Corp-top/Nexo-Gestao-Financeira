from django.db.models import Count
from rest_framework import viewsets

from common.api_mixins import TenantQuerySetMixin
from notes.models import Note, NoteList
from notes.serializers import NoteListSerializer, NoteSerializer


class NoteListViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = NoteList.objects.all()
    serializer_class = NoteListSerializer
    search_fields = ("name",)
    ordering_fields = ("name", "updated_at", "created_at")
    ordering = ("name",)
    pagination_class = None

    def get_queryset(self):
        return super().get_queryset().annotate(notes_count=Count("notes"))


class NoteViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Note.objects.select_related("note_list").all()
    serializer_class = NoteSerializer
    search_fields = ("title", "content", "note_list__name")
    filterset_fields = ("is_pinned", "color", "note_list")
    ordering_fields = ("created_at", "updated_at", "is_pinned", "title")
    ordering = ("-is_pinned", "-updated_at")
    pagination_class = None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.get_tenant()
        return context
