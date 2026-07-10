from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api_mixins import TenantQuerySetMixin
from notes.models import Note, NoteList, NoteSubtask
from notes.serializers import NoteListSerializer, NoteSerializer, NoteSubtaskSerializer


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
    queryset = Note.objects.select_related("note_list").prefetch_related("subtasks").all()
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


class NoteSubtaskViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = NoteSubtask.objects.select_related("note").all()
    serializer_class = NoteSubtaskSerializer
    filterset_fields = ("note", "is_done")
    ordering_fields = ("created_at",)
    ordering = ("is_done", "created_at")
    pagination_class = None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.get_tenant()
        return context

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        subtask = self.get_object()
        subtask.is_done = not subtask.is_done
        subtask.save(update_fields=["is_done", "updated_at"])
        return Response(NoteSubtaskSerializer(subtask).data, status=status.HTTP_200_OK)
