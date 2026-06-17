from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_alter_account_account_type_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='credit_limit',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Informe o limite de crédito (apenas para contas do tipo Cartão).',
                max_digits=12,
                null=True,
                verbose_name='Limite do cartão',
            ),
        ),
    ]
