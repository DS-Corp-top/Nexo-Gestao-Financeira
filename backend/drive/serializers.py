from rest_framework import serializers
from .models import Document, Folder

class FolderSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)

    class Meta:
        model = Folder
        fields = (
            "id",
            "name",
            "company",
            "company_name",
            "created_at",
            "updated_at",
        )

    def validate_company(self, value):
        tenant = self.context.get("tenant")
        if value and tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Empresa invalida para este tenant.")
        return value

class DocumentSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, allow_null=True)
    folder_name = serializers.CharField(source='folder.name', read_only=True, allow_null=True)
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "file",
            "file_url",
            "file_type",
            "file_size",
            "company",
            "company_name",
            "folder",
            "folder_name",
            "user",
            "user_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("user", "file_type", "file_size")

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

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["user"] = request.user
        return super().create(validated_data)
