from django.conf import settings
from whitenoise.media_types import MediaTypes


def test_webmanifest_served_with_correct_mimetype():
    """WhiteNoise ignores the stdlib mimetypes module and has no built-in
    entry for .webmanifest, so without WHITENOISE_MIMETYPES it falls back to
    application/octet-stream — which Safari/iOS silently rejects, breaking
    standalone PWA install.
    """
    media_types = MediaTypes(extra_types=settings.WHITENOISE_MIMETYPES)
    assert media_types.get_type("manifest.webmanifest") == "application/manifest+json"
