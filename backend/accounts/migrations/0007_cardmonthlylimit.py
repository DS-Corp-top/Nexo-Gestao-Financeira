from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_account_credit_limit"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CardMonthlyLimit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveIntegerField()),
                ("month", models.PositiveIntegerField()),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, verbose_name="Limite")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="monthly_limits",
                        to="accounts.account",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="card_monthly_limits",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "verbose_name": "Limite mensal do cartão",
                "verbose_name_plural": "Limites mensais do cartão",
            },
        ),
        migrations.AlterUniqueTogether(
            name="cardmonthlylimit",
            unique_together={("account", "year", "month")},
        ),
    ]
