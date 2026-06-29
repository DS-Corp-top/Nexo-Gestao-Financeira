import os
from django.conf import settings
from django.db import models

from common.tenancy import assign_tenant

class Folder(models.Model):
    name = models.CharField("Nome da Pasta", max_length=255)
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="folders",
        null=True,
        blank=True,
    )
    company = models.ForeignKey(
        "tenants.TenantCompany",
        on_delete=models.CASCADE,
        related_name="folders",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Pasta"
        verbose_name_plural = "Pastas"
        indexes = [
            models.Index(fields=("tenant", "company", "name")),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        assign_tenant(self)
        super().save(*args, **kwargs)


def document_upload_path(instance, filename):
    tenant_id = instance.tenant_id if instance.tenant_id else "unknown_tenant"
    
    # Se estiver numa pasta, tentamos usar o nome da pasta limpo
    folder_part = ""
    if instance.folder_id:
        folder_name = instance.folder.name.replace("/", "_").replace("\\", "_")
        folder_part = f"{folder_name}/"
    
    if instance.company_id:
        return f"drive/tenant_{tenant_id}/company_{instance.company_id}/{folder_part}{filename}"
    return f"drive/tenant_{tenant_id}/geral/{folder_part}{filename}"


class Document(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )
    company = models.ForeignKey(
        "tenants.TenantCompany",
        on_delete=models.SET_NULL,
        related_name="documents",
        null=True,
        blank=True,
    )
    folder = models.ForeignKey(
        Folder,
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )
    title = models.CharField("Título", max_length=255, blank=True)
    file = models.FileField("Arquivo", upload_to=document_upload_path)
    file_type = models.CharField("Tipo", max_length=50, blank=True)
    file_size = models.PositiveIntegerField("Tamanho (bytes)", default=0)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Documento"
        verbose_name_plural = "Documentos"
        indexes = [
            models.Index(fields=("tenant", "company", "folder", "-created_at")),
        ]

    def __str__(self):
        return self.title or self.file.name

    def save(self, *args, **kwargs):
        assign_tenant(self)
        
        # Se vincular a uma pasta, herda a company da pasta
        if self.folder:
            self.company = self.folder.company
            
        if not self.title and self.file:
            self.title = os.path.basename(self.file.name)
        if self.file and hasattr(self.file, "size"):
            self.file_size = self.file.size
        # We can extract file_type from extension if not provided
        if not self.file_type and self.file:
            ext = os.path.splitext(self.file.name)[1].lower()
            if ext:
                self.file_type = ext.replace(".", "")
        super().save(*args, **kwargs)
