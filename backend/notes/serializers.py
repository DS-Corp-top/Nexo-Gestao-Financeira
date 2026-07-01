from rest_framework import serializers

from notes.models import Note, NoteList


class NoteListSerializer(serializers.ModelSerializer):
    notes_count = serializers.SerializerMethodField()

    def get_notes_count(self, obj):
        return getattr(obj, "notes_count", obj.notes.count())

    class Meta:
        model = NoteList
        fields = ("id", "name", "color", "notes_count", "created_at", "updated_at")
        read_only_fields = ("id", "notes_count", "created_at", "updated_at")


class NoteSerializer(serializers.ModelSerializer):
    note_list_name = serializers.CharField(source="note_list.name", read_only=True)

    def validate_note_list(self, note_list):
        if note_list is None:
            return note_list

        request = self.context.get("request")
        tenant = self.context.get("tenant") or (getattr(request, "tenant", None) if request else None)
        requested_tenant_id = None
        if request is not None:
            requested_tenant_id = request.headers.get("X-Tenant-ID") or request.META.get("HTTP_X_TENANT_ID")

        if requested_tenant_id and str(note_list.tenant_id) != str(requested_tenant_id):
            raise serializers.ValidationError("Lista inválida para este cliente.")
        if tenant is not None and note_list.tenant_id != tenant.id:
            raise serializers.ValidationError("Lista inválida para este cliente.")
        return note_list

    class Meta:
        model = Note
        fields = (
            "id",
            "note_list",
            "note_list_name",
            "title",
            "content",
            "color",
            "is_pinned",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
