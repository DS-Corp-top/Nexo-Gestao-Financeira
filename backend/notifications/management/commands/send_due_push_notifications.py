from django.core.management.base import BaseCommand

from notifications.tasks import send_due_expense_reminders


class Command(BaseCommand):
    help = (
        "Envia push notifications de contas a vencer/vencidas. Pensado para "
        "rodar via Heroku Scheduler (sem precisar de um dyno de celery beat) "
        "ou manualmente; localmente o celery beat já dispara isso sozinho."
    )

    def handle(self, *args, **options):
        sent = send_due_expense_reminders.run()
        self.stdout.write(self.style.SUCCESS(f"{sent} notificação(ões) push enviada(s)."))
