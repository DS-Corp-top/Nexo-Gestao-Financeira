import requests
from django.core.cache import cache


BACEN_BANKS_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/"
    "Instituicoes_em_funcionamento/versao/v1/odata/"
    "SedesBancoComMultCE"
)
BACEN_BANKS_CACHE_KEY = "investments:bacen-banks"
BACEN_BANKS_CACHE_TTL_SECONDS = 24 * 60 * 60


class BacenBanksError(Exception):
    pass


def fetch_bacen_banks():
    cached = cache.get(BACEN_BANKS_CACHE_KEY)
    if cached:
        return cached

    params = {
        "$select": "CNPJ,NOME_INSTITUICAO,SEGMENTO",
        "$orderby": "NOME_INSTITUICAO",
        "$format": "json",
    }
    try:
        response = requests.get(BACEN_BANKS_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise BacenBanksError("Nao foi possivel consultar a lista do Bacen.") from exc
    except ValueError as exc:
        raise BacenBanksError("Resposta invalida ao consultar a lista do Bacen.") from exc

    banks = [
        {
            "cnpj": item.get("CNPJ") or "",
            "name": item.get("NOME_INSTITUICAO") or "",
            "segment": item.get("SEGMENTO") or "",
        }
        for item in data.get("value", [])
        if item.get("NOME_INSTITUICAO")
    ]
    cache.set(BACEN_BANKS_CACHE_KEY, banks, BACEN_BANKS_CACHE_TTL_SECONDS)
    return banks
