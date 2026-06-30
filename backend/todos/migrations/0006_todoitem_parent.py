from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("todos", "0005_project_is_finished"),
    ]

    operations = [
        migrations.AddField(
            model_name="todoitem",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="subtasks",
                to="todos.todoitem",
            ),
        ),
    ]
