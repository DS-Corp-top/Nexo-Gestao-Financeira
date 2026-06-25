from django.conf import settings
from django.db import models

from common.tenancy import assign_tenant


class Category(models.Model):
    class CategoryType(models.TextChoices):
        INCOME = "income", "Receita"
        EXPENSE = "expense", "Despesa"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="categories",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=80)
    category_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=CategoryType.choices,
    )
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("category_type", "name")
        verbose_name = "Categoria"
        verbose_name_plural = "Categorias"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "name", "category_type"),
                name="unique_category_name_type_per_tenant",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)
