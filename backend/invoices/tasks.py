import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.utils import timezone

logger = logging.getLogger(__name__)

_SAFE_ERROR_PATTERNS = {
    "login": "Credenciais inválidas. Verifique seu CPF/CNPJ e senha do portal NFS-e.",
    "timeout": "O portal demorou demais para responder. Tente novamente.",
    "playwright": "Erro ao iniciar o navegador de automação. Contate o suporte.",
}

def _sanitize_nfse_error(exc: Exception) -> str:
    msg = str(exc).lower()
    for keyword, friendly in _SAFE_ERROR_PATTERNS.items():
        if keyword in msg:
            return friendly
    return "Falha ao emitir a nota. Tente novamente ou emita manualmente no portal nfse.gov.br."


TASK_SOFT_LIMIT = 240  # 4 min — mata suavemente, salva o erro
TASK_HARD_LIMIT = 270  # 4.5 min — kill forçado pelo Celery


@shared_task(
    bind=True,
    max_retries=0,
    name="invoices.emit_nfse",
    soft_time_limit=TASK_SOFT_LIMIT,
    time_limit=TASK_HARD_LIMIT,
)
def emit_nfse_task(self, invoice_id: int) -> dict:
    from invoices.models import Invoice
    from invoices.nfse_automation import emit_nfse
    from invoices.nfse_crypto import decrypt_password

    try:
        invoice = Invoice.objects.select_related("tenant__nfse_credential").get(pk=invoice_id)
    except Invoice.DoesNotExist:
        return {"ok": False, "error": "Fatura não encontrada."}

    credential = getattr(invoice.tenant, "nfse_credential", None)
    if not credential:
        invoice.nfse_status = Invoice.NFSE_FAILED
        invoice.nfse_error = "Credenciais gov.br não cadastradas."
        invoice.save(update_fields=["nfse_status", "nfse_error"])
        return {"ok": False, "error": invoice.nfse_error}

    invoice.nfse_status = Invoice.NFSE_PROCESSING
    invoice.save(update_fields=["nfse_status"])

    invoice_data = {
        "client_name": invoice.client_name,
        "client_document": invoice.client_document,
        "client_email": invoice.client_email,
        "client_address": invoice.client_address,
        "client_city": invoice.client_city,
        "service_code": invoice.service_code,
        "service_description": invoice.service_description,
        "competencia": invoice.issue_date.strftime("%m/%Y"),
        "gross_value": str(invoice.gross_value),
        "deductions": str(invoice.deductions),
        "iss_rate": str(invoice.iss_rate),
        "iss_withheld": invoice.iss_withheld,
    }

    try:
        nfse_number = emit_nfse(
            cpf=credential.gov_br_cpf,
            password=decrypt_password(credential.gov_br_password_enc),
            invoice_data=invoice_data,
        )
        invoice.nfse_status = Invoice.NFSE_ISSUED
        invoice.nfse_number = nfse_number
        invoice.nfse_error = ""
        invoice.save(update_fields=["nfse_status", "nfse_number", "nfse_error"])
        return {"ok": True, "nfse_number": nfse_number}

    except SoftTimeLimitExceeded:
        logger.warning("Timeout ao emitir NFS-e para fatura %s", invoice_id)
        invoice.nfse_status = Invoice.NFSE_FAILED
        invoice.nfse_error = "Tempo limite excedido. O portal demorou demais para responder. Tente novamente ou emita manualmente."
        invoice.save(update_fields=["nfse_status", "nfse_error"])
        return {"ok": False, "error": "Timeout"}

    except Exception as exc:
        logger.exception("Falha ao emitir NFS-e para fatura %s", invoice_id)
        invoice.nfse_status = Invoice.NFSE_FAILED
        # Mensagem sanitizada — detalhes técnicos ficam apenas no log, nunca expostos ao usuário
        error_msg = _sanitize_nfse_error(exc)
        invoice.nfse_error = error_msg
        invoice.save(update_fields=["nfse_status", "nfse_error"])
        return {"ok": False, "error": error_msg}
