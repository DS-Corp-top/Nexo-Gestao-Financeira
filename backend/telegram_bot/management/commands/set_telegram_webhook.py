import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Registra o webhook do bot do Telegram apontando para esta aplicação."

    def add_arguments(self, parser):
        parser.add_argument(
            "url",
            help="URL pública HTTPS do endpoint, ex: https://appnexo.top/api/v1/telegram/webhook/",
        )

    def handle(self, *args, **options):
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            raise CommandError("TELEGRAM_BOT_TOKEN não configurado no ambiente.")

        payload = {"url": options["url"]}
        if settings.TELEGRAM_WEBHOOK_SECRET:
            payload["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET

        response = requests.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json=payload,
            timeout=10,
        )
        self.stdout.write(response.text)
