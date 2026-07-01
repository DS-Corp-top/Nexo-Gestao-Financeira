from django.conf import settings
from django.db import models

from common.tenancy import assign_tenant


class NoteList(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="note_lists",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="note_lists",
        null=True,
        blank=True,
    )
    name = models.CharField("Lista", max_length=120)
    color = models.CharField("Cor", max_length=7, default="#60a5fa")
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Lista de anotações"
        verbose_name_plural = "Listas de anotações"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "name"),
                name="unique_note_list_name_per_tenant",
            )
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        assign_tenant(self)
        super().save(*args, **kwargs)


class Note(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="notes",
        null=True,
        blank=True,
    )
    note_list = models.ForeignKey(
        NoteList,
        on_delete=models.SET_NULL,
        related_name="notes",
        null=True,
        blank=True,
        verbose_name="Lista",
    )
    title = models.CharField("Título", max_length=200, blank=True)
    content = models.TextField("Conteúdo")
    color = models.CharField("Cor", max_length=7, default="#fef08a")
    is_pinned = models.BooleanField("Fixada", default=False)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("-is_pinned", "-updated_at")
        verbose_name = "Anotação"
        verbose_name_plural = "Anotações"
        indexes = [
            models.Index(fields=("tenant", "-is_pinned", "-updated_at"), name="note_tenant_pin_idx"),
            models.Index(fields=("tenant", "note_list", "-updated_at"), name="note_tenant_list_idx"),
        ]

    def __str__(self):
        return self.title or self.content[:50]

    def save(self, *args, **kwargs):
        assign_tenant(self)
        super().save(*args, **kwargs)
