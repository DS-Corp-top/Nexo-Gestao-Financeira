from decimal import Decimal, InvalidOperation

import requests
from django.core.cache import cache


AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL"
CACHE_KEY = "investments:exchange-rates:brl"
CACHE_TTL_SECONDS = 300


class ExchangeRateError(Exception):
    pass


def _decimal_from_quote(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ExchangeRateError("Cotacao invalida recebida.") from exc


def fetch_brl_exchange_rates():
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached

    try:
        response = requests.get(AWESOMEAPI_URL, timeout=5)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise ExchangeRateError("Nao foi possivel consultar as cotacoes.") from exc
    except ValueError as exc:
        raise ExchangeRateError("Resposta invalida ao consultar cotacoes.") from exc

    usd = data.get("USDBRL") or {}
    eur = data.get("EURBRL") or {}
    rates = {
        "base": "BRL",
        "rates": {
            "BRL": Decimal("1"),
            "USD": _decimal_from_quote(usd.get("bid")),
            "EUR": _decimal_from_quote(eur.get("bid")),
        },
        "updated_at": max(
            usd.get("create_date") or "",
            eur.get("create_date") or "",
        ) or None,
        "source": "AwesomeAPI",
    }
    cache.set(CACHE_KEY, rates, CACHE_TTL_SECONDS)
    return rates
