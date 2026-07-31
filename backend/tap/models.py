from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Max

from common.tenancy import assign_tenant


class ProjectCharter(models.Model):
    """TAP — Termo de Abertura de Projeto. Documento formal vinculado a um
    Projeto (todos.Project) que registra justificativa, objetivos, escopo,
    partes interessadas e demais informações de abertura do projeto."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        APPROVED = "approved", "Aprovado"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_charters",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="project_charters",
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "todos.Project",
        on_delete=models.CASCADE,
        related_name="charters",
        verbose_name="Projeto",
    )
    number = models.PositiveIntegerField("Número")
    status = models.CharField(
        "Status", max_length=20, choices=Status.choices, default=Status.DRAFT
    )

    justification = models.TextField("Justificativa", blank=True)
    objectives = models.TextField("Objetivos", blank=True)
    scope = models.TextField("Escopo", blank=True)
    technologies = models.TextField("Tecnologias utilizadas", blank=True)
    deliverables = models.TextField("Principais entregas", blank=True)
    assumptions = models.TextField("Premissas", blank=True)
    constraints = models.TextField("Restrições", blank=True)
    risks = models.TextField("Riscos preliminares", blank=True)
    stakeholders = models.TextField("Partes interessadas", blank=True)

    sponsor_name = models.CharField("Patrocinador", max_length=200, blank=True)
    project_manager_name = models.CharField("Gerente do projeto", max_length=200, blank=True)
    co_responsibles = models.TextField("Co-responsaveis", blank=True)

    start_date = models.DateField("Início previsto", null=True, blank=True)
    end_date = models.DateField("Término previsto", null=True, blank=True)
    estimated_budget = models.DecimalField(
        "Orçamento estimado (R$)", max_digits=12, decimal_places=2, null=True, blank=True,
        default=Decimal("0.00"),
    )

    approved_at = models.DateField("Data de aprovação", null=True, blank=True)
    approved_by_name = models.CharField("Aprovado por", max_length=200, blank=True)

    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "number"], name="unique_tap_number_per_tenant"
            )
        ]
        verbose_name = "Termo de Abertura de Projeto"
        verbose_name_plural = "Termos de Abertura de Projeto"

    def __str__(self):
        return f"TAP {self.number_display} — {self.project.name}"

    @property
    def number_display(self):
        year = self.created_at.year if self.created_at else self.project.created_at.year
        return f"{self.number:04d}/{year}"

    @classmethod
    def next_number(cls, tenant):
        result = cls.objects.filter(tenant=tenant).aggregate(Max("number"))
        return (result["number__max"] or 0) + 1

    def save(self, *args, **kwargs):
        assign_tenant(self)
        if not self.number:
            self.number = self.next_number(self.tenant)
        super().save(*args, **kwargs)
