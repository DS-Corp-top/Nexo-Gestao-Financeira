from django.contrib import admin

from notes.models import Note, NoteList, NoteSubtask


@admin.register(NoteList)
class NoteListAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "tenant", "color", "updated_at")
    list_filter = ("tenant",)
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("title", "note_list", "user", "tenant", "is_pinned", "color", "updated_at")
    list_filter = ("is_pinned", "tenant", "note_list")
    search_fields = ("title", "content", "note_list__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(NoteSubtask)
class NoteSubtaskAdmin(admin.ModelAdmin):
    list_display = ("title", "note", "user", "tenant", "is_done", "updated_at")
    list_filter = ("is_done", "tenant")
    search_fields = ("title", "note__title")
    readonly_fields = ("created_at", "updated_at")
