from django.db import migrations, models
import core.upload_paths


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0011_tenant_logo_central_upload_path"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantcompany",
            name="logo",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=core.upload_paths.TenantPath("companies/logo"),
                verbose_name="Logo da empresa",
            ),
        ),
    ]
