from rest_framework_simplejwt.authentication import JWTAuthentication

_ACCESS_COOKIE = "access_token"


class CookieJWTAuthentication(JWTAuthentication):
    """JWTAuthentication that falls back to reading the access token from an httpOnly cookie."""

    def authenticate(self, request):
        # Prefer Authorization header when present
        if self.get_header(request) is not None:
            return super().authenticate(request)
        raw_token = request.COOKIES.get(_ACCESS_COOKIE)
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
