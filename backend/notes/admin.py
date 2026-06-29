from django.contrib import admin

from notes.models import Note


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "tenant", "is_pinned", "color", "updated_at")
    list_filter = ("is_pinned", "tenant")
    search_fields = ("title", "content")
    readonly_fields = ("created_at", "updated_at")
