from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from common.tenancy import assign_tenant


class ShoppingList(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shopping_lists",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="shopping_lists",
        null=True,
        blank=True,
    )
    name = models.CharField("Lista", max_length=120)
    list_date = models.DateField("Data da lista", default=timezone.localdate)
    notes = models.CharField("Observacao", max_length=220, blank=True)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("-updated_at", "-created_at")
        verbose_name = "Lista de compra"
        verbose_name_plural = "Listas de compra"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "name"),
                name="unique_shopping_list_name_per_tenant",
            )
        ]

    def __str__(self):
        return self.name

    @property
    def pending_count(self) -> int:
        return sum(1 for item in self.items.all() if not item.is_purchased)

    @property
    def purchased_count(self) -> int:
        return sum(1 for item in self.items.all() if item.is_purchased)

    @property
    def purchased_total(self) -> Decimal:
        total = Decimal("0.00")
        for item in self.items.all():
            if item.is_purchased:
                total += item.estimated_total
        return total.quantize(Decimal("0.01"))

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)


class ShoppingItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shopping_items",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="shopping_items",
        null=True,
        blank=True,
    )
    shopping_list = models.ForeignKey(
        ShoppingList,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="Lista",
    )
    title = models.CharField("Item", max_length=140)
    quantity = models.PositiveIntegerField(
        "Quantidade",
        default=1,
        validators=[MinValueValidator(1)],
    )
    unit_price = models.DecimalField(
        "Preco unitario estimado",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    notes = models.CharField("Observacao", max_length=220, blank=True)
    is_purchased = models.BooleanField("Comprado", default=False)
    purchased_at = models.DateTimeField("Comprado em", null=True, blank=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("is_purchased", "-updated_at", "-created_at")
        verbose_name = "Item de compra"
        verbose_name_plural = "Itens de compra"
        indexes = [
            models.Index(
                fields=("tenant", "shopping_list", "is_purchased", "updated_at"),
                name="shop_item_tenant_list_idx",
            ),
            models.Index(
                fields=("tenant", "created_at"),
                name="shopping_sh_tenant_id_idx",
            ),
        ]

    def __str__(self):
        return self.title

    @property
    def estimated_total(self) -> Decimal:
        if self.unit_price is None:
            return Decimal("0.00")
        return (self.unit_price * self.quantity).quantize(Decimal("0.01"))

    def toggle_purchased(self):
        self.is_purchased = not self.is_purchased
        self.purchased_at = timezone.now() if self.is_purchased else None

    def clean(self):
        assign_tenant(self)
        if self.shopping_list and self.shopping_list.tenant_id != self.tenant_id:
            raise ValidationError({"shopping_list": "Lista invalida para este cliente."})

    def save(self, *args, **kwargs):
        assign_tenant(self)
        if self.is_purchased and self.purchased_at is None:
            self.purchased_at = timezone.now()
        if not self.is_purchased:
            self.purchased_at = None
        return super().save(*args, **kwargs)
