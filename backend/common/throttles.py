from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginThrottle(AnonRateThrottle):
    """10 login attempts per minute per IP."""
    scope = "login"


class CnpjLookupThrottle(UserRateThrottle):
    """60 CNPJ lookups per hour per user."""
    scope = "cnpj_lookup"


class CepLookupThrottle(UserRateThrottle):
    """60 CEP lookups per hour per user."""
    scope = "cep_lookup"


class PasswordResetRequestThrottle(AnonRateThrottle):
    """5 password reset code requests per hour per IP."""
    scope = "password_reset_request"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    """20 password reset code confirmations per hour per IP — bounds brute-force
    guessing of the 6-digit code (also capped per-code by MAX_CODE_ATTEMPTS)."""
    scope = "password_reset_confirm"


class PasswordResetCompleteThrottle(AnonRateThrottle):
    """10 password reset completions per hour per IP."""
    scope = "password_reset_complete"
