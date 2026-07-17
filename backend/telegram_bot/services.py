import logging
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Optional

import requests
from django.conf import settings

from categories.models import Category
from transactions.models import Transaction

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"

# Presença de qualquer uma dessas palavras (normalizadas, sem acento) trata a
# mensagem como Receita em vez de Despesa — Despesa é o padrão porque é o
# caso de uso mais comum de lançamento rápido por mensagem.
INCOME_KEYWORDS = {
    "recebi", "receita", "salario", "venda", "vendi",
    "entrada", "freela", "freelance", "pagamento recebido",
}

# Aceita "89", "89,90" e "1.234,56" — formato brasileiro de valor monetário.
AMOUNT_PATTERN = re.compile(r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)")


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn").lower()


def send_telegram_message(chat_id, text: str) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN não configurado; mensagem não enviada.")
        return
    try:
        requests.post(
            f"{TELEGRAM_API_BASE}/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=8,
        )
    except requests.RequestException:
        logger.exception("Falha ao enviar mensagem via Telegram para chat_id=%s", chat_id)


def _extract_amount(text: str) -> Optional[Decimal]:
    match = AMOUNT_PATTERN.search(text)
    if not match:
        return None
    raw = match.group(1)
    # "1.234,56" -> "1234.56" ; "89,90" -> "89.90" ; "89.90" já vem certo.
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        amount = Decimal(raw)
    except InvalidOperation:
        return None
    return amount if amount > 0 else None


def _match_category(text: str, tenant, transaction_type: str):
    normalized_text = _normalize(text)
    categories = Category.objects.filter(tenant=tenant, category_type=transaction_type)
    for category in categories:
        if _normalize(category.name) in normalized_text:
            return category
    return None


def parse_transaction_message(text: str, tenant) -> Optional[dict]:
    """Extrai valor, tipo e categoria de uma mensagem livre tipo "Mercado 89,90".

    Retorna None quando não encontra nenhum valor monetário na mensagem —
    nesse caso o chamador deve responder pedindo pra reformular.
    """
    amount = _extract_amount(text)
    if amount is None:
        return None

    normalized_text = _normalize(text)
    transaction_type = (
        Transaction.TransactionType.INCOME
        if any(keyword in normalized_text for keyword in INCOME_KEYWORDS)
        else Transaction.TransactionType.EXPENSE
    )

    category = _match_category(text, tenant, transaction_type)

    return {
        "amount": amount,
        "transaction_type": transaction_type,
        "category": category,
    }
