import logging
import re
import unicodedata
from datetime import date as date_cls, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

import requests
from django.conf import settings
from django.utils import timezone

from accounts.models import Account
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

# Data relativa por palavra-chave (normalizada, sem acento) — checado nessa
# ordem porque "anteontem" contém "ontem" como substring.
RELATIVE_DATE_KEYWORDS = (
    ("anteontem", -2),
    ("ontem", -1),
    ("amanha", 1),
    ("hoje", 0),
)

# Data explícita "15/07" ou "15/07/2026" — dia/mês primeiro (formato BR).
EXPLICIT_DATE_PATTERN = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")


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


def _extract_date(text: str, normalized_text: str) -> tuple[date_cls, str]:
    """Retorna (data, texto_sem_a_data). A data removida do texto evita que
    "15/07" seja lido como valor monetário pelo _extract_amount depois."""
    match = EXPLICIT_DATE_PATTERN.search(text)
    if match:
        day, month, year = match.groups()
        year = int(year) if year else timezone.localdate().year
        if year < 100:
            year += 2000
        try:
            explicit_date = date_cls(year, int(month), int(day))
        except ValueError:
            pass
        else:
            remaining_text = text[: match.start()] + text[match.end():]
            return explicit_date, remaining_text

    today = timezone.localdate()
    for keyword, day_delta in RELATIVE_DATE_KEYWORDS:
        if keyword in normalized_text:
            return today + timedelta(days=day_delta), text

    return today, text


def _match_account(text: str, tenant):
    normalized_text = _normalize(text)
    accounts = Account.objects.filter(tenant=tenant, is_active=True)
    # Nomes mais longos primeiro — evita que "Nu" case antes de "Nubank Cartão"
    # quando o usuário tem duas contas com nomes parecidos.
    for account in sorted(accounts, key=lambda a: len(a.name), reverse=True):
        if _normalize(account.name) in normalized_text:
            return account
    return None


def parse_transaction_message(text: str, tenant) -> Optional[dict]:
    """Extrai valor, tipo, categoria, conta e data de uma mensagem livre tipo
    "Mercado 89,90 Nubank ontem".

    Retorna None quando não encontra nenhum valor monetário na mensagem —
    nesse caso o chamador deve responder pedindo pra reformular. A conta é
    None quando nenhum nome de conta aparece na mensagem — nesse caso o
    chamador deve usar a conta padrão configurada no vínculo. A data é hoje
    quando a mensagem não menciona nem uma data explícita (15/07 ou
    15/07/2026) nem uma palavra relativa (hoje/ontem/anteontem/amanhã).
    """
    normalized_text = _normalize(text)
    entry_date, text_without_date = _extract_date(text, normalized_text)

    amount = _extract_amount(text_without_date)
    if amount is None:
        return None

    transaction_type = (
        Transaction.TransactionType.INCOME
        if any(keyword in normalized_text for keyword in INCOME_KEYWORDS)
        else Transaction.TransactionType.EXPENSE
    )

    category = _match_category(text, tenant, transaction_type)
    account = _match_account(text, tenant)

    return {
        "amount": amount,
        "transaction_type": transaction_type,
        "category": category,
        "account": account,
        "date": entry_date,
    }
