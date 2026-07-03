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
