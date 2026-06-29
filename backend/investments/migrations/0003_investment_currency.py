from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("investments", "0002_alter_investment_investment_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="investment",
            name="currency",
            field=models.CharField(
                choices=[("BRL", "Real"), ("USD", "Dolar"), ("EUR", "Euro")],
                default="BRL",
                max_length=3,
                verbose_name="Moeda",
            ),
        ),
    ]
