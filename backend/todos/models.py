import os

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.files import compute_file_hash
from common.tenancy import assign_tenant


class Project(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="todo_projects",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="todo_projects",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=100)
    description = models.TextField("Descricao", blank=True)
    color = models.CharField("Cor", max_length=7, default="#6366f1")
    is_finished = models.BooleanField("Finalizado", default=False)
    finished_at = models.DateTimeField("Finalizado em", null=True, blank=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Projeto"
        verbose_name_plural = "Projetos"
        indexes = [
            models.Index(fields=("tenant",), name="project_tenant_idx"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        assign_tenant(self)
        if self.is_finished and self.finished_at is None:
            self.finished_at = timezone.now()
        elif not self.is_finished:
            self.finished_at = None
        super().save(*args, **kwargs)


class TodoItem(models.Model):
    class Priority(models.TextChoices):
        LOW = "low", "Baixa"
        MEDIUM = "medium", "Media"
        HIGH = "high", "Alta"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        IN_PROGRESS = "in_progress", "Em andamento"
        DONE = "done", "Finalizado"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="todo_items",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="todo_items",
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "todos.Project",
        on_delete=models.SET_NULL,
        related_name="todos",
        null=True,
        blank=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="subtasks",
        null=True,
        blank=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_todos",
        null=True,
        blank=True,
    )
    title = models.CharField("Titulo", max_length=200)
    description = models.TextField("Descricao", blank=True)
    is_done = models.BooleanField("Concluida", default=False)
    status = models.CharField(
        "Status",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    priority = models.CharField(
        "Prioridade",
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    due_date = models.DateField("Prazo", null=True, blank=True)
    order = models.IntegerField(
        "Ordem",
        default=0,
        help_text="Posicao do card dentro da coluna do quadro Kanban.",
    )
    done_at = models.DateTimeField("Concluida em", null=True, blank=True)
    is_archived = models.BooleanField("Arquivada", default=False)
    archived_at = models.DateTimeField("Arquivada em", null=True, blank=True)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("is_done", "order", "-created_at")
        verbose_name = "Tarefa"
        verbose_name_plural = "Tarefas"
        indexes = [
            models.Index(fields=("tenant", "is_done", "-created_at"), name="todo_tenant_done_idx"),
        ]

    def __str__(self):
        return self.title

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._loaded_status = instance.status
        instance._loaded_is_done = instance.is_done
        return instance

    def toggle(self):
        self.status = self.Status.PENDING if self.status == self.Status.DONE else self.Status.DONE
        self.is_done = self.status == self.Status.DONE
        self.done_at = timezone.now() if self.is_done else None

    def save(self, *args, **kwargs):
        assign_tenant(self)
        if self.parent_id:
            self.project = self.parent.project

        # status and is_done are kept in sync, but a partial update (eg. PATCH
        # {"status": "pending"} on an existing DONE item) only touches one of
        # them — the other keeps its stale, already-persisted value. Whichever
        # field actually changed since the row was loaded wins the sync;
        # for a brand-new instance (nothing loaded yet) is_done wins, as before.
        loaded_status = getattr(self, "_loaded_status", None)
        loaded_is_done = getattr(self, "_loaded_is_done", None)
        status_changed = loaded_status is not None and self.status != loaded_status
        is_done_changed = loaded_is_done is not None and self.is_done != loaded_is_done

        if status_changed and not is_done_changed:
            self.is_done = self.status == self.Status.DONE
        elif is_done_changed and not status_changed:
            if self.is_done:
                self.status = self.Status.DONE
            elif self.status == self.Status.DONE:
                self.status = self.Status.PENDING
        elif self.status == self.Status.DONE:
            self.is_done = True
        elif self.is_done:
            self.status = self.Status.DONE
        else:
            self.is_done = False

        if self.is_done and self.done_at is None:
            self.done_at = timezone.now()
        if not self.is_done:
            self.done_at = None
            self.is_archived = False
        if self.is_archived and self.archived_at is None:
            self.archived_at = timezone.now()
        elif not self.is_archived:
            self.archived_at = None
        super().save(*args, **kwargs)


def todo_attachment_upload_path(instance, filename):
    tenant_id = instance.tenant_id or "sem_tenant"
    return f"todos/tenant_{tenant_id}/todo_{instance.todo_id}/{filename}"


class TodoAttachment(models.Model):
    todo = models.ForeignKey(
        TodoItem,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="todo_attachments",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="todo_attachments",
    )
    file = models.FileField("Arquivo", upload_to=todo_attachment_upload_path)
    file_name = models.CharField("Nome do arquivo", max_length=255, blank=True)
    file_type = models.CharField("Tipo", max_length=50, blank=True)
    file_size = models.PositiveIntegerField("Tamanho (bytes)", default=0)
    content_hash = models.CharField("Hash do conteudo", max_length=64, blank=True, db_index=True)
    created_at = models.DateTimeField("Enviado em", auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Anexo de tarefa"
        verbose_name_plural = "Anexos de tarefa"
        indexes = [
            models.Index(fields=("tenant", "todo"), name="todo_attach_tenant_idx"),
        ]

    def __str__(self):
        return self.file_name or self.file.name

    def save(self, *args, **kwargs):
        assign_tenant(self)
        if self.file and not self.file_name:
            self.file_name = os.path.basename(self.file.name)
        if self.file and hasattr(self.file, "size"):
            self.file_size = self.file.size
        if self.file and not self.file_type:
            ext = os.path.splitext(self.file.name)[1].lower()
            if ext:
                self.file_type = ext.replace(".", "")
        if self.file and not self.content_hash:
            self.content_hash = compute_file_hash(self.file)
        super().save(*args, **kwargs)
