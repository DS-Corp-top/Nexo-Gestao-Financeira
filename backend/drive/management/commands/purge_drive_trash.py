from django.core.management.base import BaseCommand

from drive.tasks import purge_expired_trash


class Command(BaseCommand):
    help = (
        "Exclui definitivamente arquivos/pastas da lixeira do Drive com mais de "
        "30 dias. Pensado para rodar via Heroku Scheduler (sem precisar de um "
        "dyno de celery beat) ou manualmente; localmente o celery beat já "
        "dispara isso sozinho."
    )

    def handle(self, *args, **options):
        result = purge_expired_trash.run()
        self.stdout.write(self.style.SUCCESS(
            f"{result['documents_deleted']} documento(s) e {result['folders_deleted']} "
            f"pasta(s) excluídos definitivamente."
        ))
