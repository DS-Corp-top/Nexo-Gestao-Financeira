from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from nexo.react_build import find_react_index, react_build_missing_message


class Command(BaseCommand):
    help = "Validate that the compiled React app is present when Django serves it."

    def handle(self, *args, **options):
        if not settings.SERVE_REACT_APP:
            self.stdout.write("React app serving is disabled.")
            return

        index_path = find_react_index(settings)
        if index_path is None:
            raise CommandError(
                f"{react_build_missing_message(settings)} "
                "Check that the Heroku Node.js buildpack runs before the Python buildpack."
            )

        self.stdout.write(self.style.SUCCESS(f"React build found at {index_path}"))
