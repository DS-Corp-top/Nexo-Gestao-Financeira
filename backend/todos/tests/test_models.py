import pytest

from todos.models import TodoItem


@pytest.mark.django_db
def test_project_save_sets_finished_at_when_marked_finished(baker):
    """Ao marcar um projeto como finalizado, finished_at deve ser preenchido."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    project = baker.make("todos.Project", user=user, tenant=tenant, is_finished=False)
    assert project.finished_at is None

    project.is_finished = True
    project.save()

    assert project.finished_at is not None


@pytest.mark.django_db
def test_project_save_clears_finished_at_when_unmarked(baker):
    """Ao desmarcar um projeto finalizado, finished_at deve voltar a None."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    project = baker.make("todos.Project", user=user, tenant=tenant, is_finished=True)
    assert project.finished_at is not None

    project.is_finished = False
    project.save()

    assert project.finished_at is None


@pytest.mark.django_db
def test_todo_item_toggle_marks_done_and_sets_done_at(baker):
    """toggle() deve marcar a tarefa como concluida e preencher done_at."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    item = baker.make(
        "todos.TodoItem",
        user=user,
        tenant=tenant,
        status=TodoItem.Status.PENDING,
        is_done=False,
    )

    item.toggle()

    assert item.status == TodoItem.Status.DONE
    assert item.is_done is True
    assert item.done_at is not None


@pytest.mark.django_db
def test_todo_item_toggle_twice_reverts_to_pending(baker):
    """Chamar toggle() duas vezes deve devolver a tarefa ao estado pendente."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    item = baker.make(
        "todos.TodoItem",
        user=user,
        tenant=tenant,
        status=TodoItem.Status.PENDING,
        is_done=False,
    )

    item.toggle()
    item.toggle()

    assert item.status == TodoItem.Status.PENDING
    assert item.is_done is False
    assert item.done_at is None


@pytest.mark.django_db
def test_todo_item_save_inherits_project_from_parent(baker):
    """Subtarefas devem herdar o projeto da tarefa pai ao salvar."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    project = baker.make("todos.Project", user=user, tenant=tenant)
    parent = baker.make("todos.TodoItem", user=user, tenant=tenant, project=project)

    child = TodoItem(user=user, tenant=tenant, parent=parent, title="Subtarefa")
    child.save()

    assert child.project_id == project.id


@pytest.mark.django_db
def test_todo_item_save_syncs_status_and_is_done(baker):
    """Definir status=DONE diretamente deve sincronizar is_done e done_at."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    item = TodoItem(
        user=user,
        tenant=tenant,
        title="Tarefa",
        status=TodoItem.Status.DONE,
    )
    item.save()

    assert item.is_done is True
    assert item.done_at is not None


@pytest.mark.django_db
def test_todo_item_save_is_done_true_forces_status_done(baker):
    """is_done=True com status ainda pendente deve sincronizar o status para DONE."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    item = TodoItem(
        user=user,
        tenant=tenant,
        title="Tarefa",
        status=TodoItem.Status.PENDING,
        is_done=True,
    )
    item.save()

    assert item.status == TodoItem.Status.DONE
    assert item.is_done is True
    assert item.done_at is not None
