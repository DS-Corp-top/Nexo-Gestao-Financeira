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

    def get_queryset(self):
        qs = super().get_queryset()
        from django.db.models import Q
        return qs.filter(Q(visibility="public") | Q(user=self.request.user))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.get_tenant()
        return context

    def update(self, request, *args, **kwargs):
        if self.get_object().user != request.user:
            return Response({"detail": "Você não tem permissão para editar esta anotação."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().user != request.user:
            return Response({"detail": "Você não tem permissão para excluir esta anotação."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class NoteSubtaskViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = NoteSubtask.objects.select_related("note").all()
    serializer_class = NoteSubtaskSerializer
    filterset_fields = ("note", "is_done")
    ordering_fields = ("created_at",)
    ordering = ("is_done", "created_at")
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        from django.db.models import Q
        return qs.filter(Q(note__visibility="public") | Q(note__user=self.request.user))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.get_tenant()
        return context

    def update(self, request, *args, **kwargs):
        subtask = self.get_object()
        if subtask.user != request.user and subtask.note.user != request.user:
            return Response({"detail": "Você não tem permissão para editar esta subtarefa."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        subtask = self.get_object()
        if subtask.user != request.user and subtask.note.user != request.user:
            return Response({"detail": "Você não tem permissão para excluir esta subtarefa."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        subtask = self.get_object()
        subtask.is_done = not subtask.is_done
        subtask.save(update_fields=["is_done", "updated_at"])
        return Response(NoteSubtaskSerializer(subtask).data, status=status.HTTP_200_OK)
