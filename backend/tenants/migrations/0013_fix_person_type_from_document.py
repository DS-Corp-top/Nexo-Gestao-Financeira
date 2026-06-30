import re

from django.db import migrations


def fix_person_type(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    for tenant in Tenant.objects.all():
        digits = re.sub(r"\D", "", tenant.document or "")
        correct = "pj" if len(digits) == 14 else "pf"
        if tenant.person_type != correct:
            tenant.person_type = correct
            tenant.save(update_fields=["person_type"])


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0012_tenantcompany_logo"),
    ]

    operations = [
        migrations.RunPython(fix_person_type, migrations.RunPython.noop),
    ]
