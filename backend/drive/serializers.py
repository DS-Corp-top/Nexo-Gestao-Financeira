from rest_framework import serializers
from .models import Document, Folder, TRASH_RETENTION_DAYS


def _days_until_purge(obj):
    if not obj.deleted_at:
        return None
    from django.utils import timezone

    elapsed = timezone.now() - obj.deleted_at
    remaining = TRASH_RETENTION_DAYS - elapsed.days
    return max(remaining, 0)

_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
# Denylist (not allowlist) — Drive stores arbitrary business documents (PDFs,
# spreadsheets, images, etc.), so we only block file types that are dangerous
# to host/serve rather than restrict to a fixed set of "safe" extensions.
_DOCUMENT_BLOCKED_EXTENSIONS = {
    "html", "htm", "svg", "xhtml", "shtml",
    "js", "mjs", "php", "phtml", "asp", "aspx", "jsp",
    "exe", "dll", "msi", "bat", "cmd", "com", "scr", "vbs", "ps1", "sh",
}


def validate_document_file(file):
    if file is None:
        return file
    ext = (file.name.rsplit(".", 1)[-1].lower()) if "." in file.name else ""
    if ext in _DOCUMENT_BLOCKED_EXTENSIONS:
        raise serializers.ValidationError(
            f"Tipo de arquivo não permitido: .{ext}."
        )
    if file.size > _DOCUMENT_MAX_BYTES:
        raise serializers.ValidationError("O arquivo deve ter no máximo 50 MB.")
    return file


class FolderSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    days_until_purge = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = (
            "id",
            "name",
            "company",
            "company_name",
            "parent",
            "deleted_at",
            "days_until_purge",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("deleted_at", "days_until_purge")

    def get_days_until_purge(self, obj):
        return _days_until_purge(obj)

    def validate_company(self, value):
        tenant = self.context.get("tenant")
        if value and tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Empresa invalida para este tenant.")
        return value

    def validate_parent(self, value):
        tenant = self.context.get("tenant")
        if value and tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Pasta pai inválida para este tenant.")
        if value and self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError("Uma pasta não pode ser pai dela mesma.")
        return value

    def validate(self, attrs):
        # A subfolder always belongs to the same company as its parent — the
        # parent's company is the source of truth, not whatever the client
        # sent (mirrors how Document.save() inherits company from its folder).
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if parent is not None:
            attrs["company"] = parent.company
        return attrs

class DocumentSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, allow_null=True)
    folder_name = serializers.CharField(source='folder.name', read_only=True, allow_null=True)
    file_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    days_until_purge = serializers.SerializerMethodField()
    file = serializers.FileField(validators=[validate_document_file])

    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "file",
            "file_url",
            "thumbnail_url",
            "file_type",
            "file_size",
            "company",
            "company_name",
            "folder",
            "folder_name",
            "user",
            "user_name",
            "deleted_at",
            "days_until_purge",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("user", "file_type", "file_size", "thumbnail_url", "deleted_at", "days_until_purge")

    def get_days_until_purge(self, obj):
        return _days_until_purge(obj)

    def validate_company(self, value):
        tenant = self.context.get("tenant")
        if value and tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Empresa invalida para este tenant.")
        return value

    def validate_folder(self, value):
        tenant = self.context.get("tenant")
        if value and tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Pasta invalida para este tenant.")
        return value

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["user"] = request.user
        return super().create(validated_data)
