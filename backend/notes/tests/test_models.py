import pytest


@pytest.mark.django_db
def test_note_creation(baker):
    """Nota deve ser criada com os campos corretos."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make(
        "notes.Note",
        user=user,
        tenant=tenant,
        title="Lembrete",
        content="Conteudo importante",
        is_pinned=True,
    )

    assert note.id is not None
    assert note.title == "Lembrete"
    assert note.content == "Conteudo importante"
    assert note.is_pinned is True
    assert str(note) == "Lembrete"


@pytest.mark.django_db
def test_note_str_uses_content_when_no_title(baker):
    """Sem titulo, __str__ deve usar as primeiras 50 chars do conteudo."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make(
        "notes.Note",
        user=user,
        tenant=tenant,
        title="",
        content="Texto longo sem titulo para verificar truncamento",
    )

    assert str(note) == "Texto longo sem titulo para verificar truncamento"


@pytest.mark.django_db
def test_note_default_color(baker):
    """Cor padrao da nota deve ser amarela (#fef08a)."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make("notes.Note", user=user, tenant=tenant, content="Test")

    assert note.color == "#fef08a"
    assert note.is_pinned is False


@pytest.mark.django_db
def test_note_content_can_be_blank(baker):
    """Conteudo da nota deve aceitar string vazia (nota so com titulo)."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make("notes.Note", user=user, tenant=tenant, title="So titulo", content="")

    assert note.content == ""
    assert note.title == "So titulo"


@pytest.mark.django_db
def test_note_subtask_creation(baker):
    """Subtarefa deve ser criada vinculada a nota e assumir o tenant da nota."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Lista")

    subtask = baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, title="Item 1")

    assert subtask.id is not None
    assert subtask.note_id == note.id
    assert subtask.is_done is False
    assert str(subtask) == "Item 1"


@pytest.mark.django_db
def test_note_subtasks_total_and_done_properties(baker):
    """Propriedades subtasks_total e subtasks_done devem refletir as subtarefas da nota."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Lista")
    baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, is_done=True)
    baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, is_done=False)
    baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, is_done=False)

    assert note.subtasks_total == 3
    assert note.subtasks_done == 1


@pytest.mark.django_db
def test_note_subtasks_properties_are_zero_without_subtasks(baker):
    """Nota sem subtarefas deve reportar total e concluidas como zero."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Lista vazia")

    assert note.subtasks_total == 0
    assert note.subtasks_done == 0
