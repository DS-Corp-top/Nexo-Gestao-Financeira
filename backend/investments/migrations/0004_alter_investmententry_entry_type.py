from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("investments", "0003_investment_currency"),
    ]

    operations = [
        migrations.AlterField(
            model_name="investmententry",
            name="entry_type",
            field=models.CharField(
                choices=[
                    ("deposit", "Aporte"),
                    ("withdrawal", "Resgate"),
                    ("dividend", "Dividendo"),
                    ("yield", "Rendimento"),
                    ("tax", "Imposto / IR/IOF"),
                ],
                default="deposit",
                max_length=20,
                verbose_name="Tipo",
            ),
        ),
    ]
