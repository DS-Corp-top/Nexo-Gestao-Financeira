from decimal import Decimal

from django.apps import apps
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from common.tenancy import resolve_tenant
from transactions.models import Transaction


ZERO = Decimal("0.00")


def _sum_amount(queryset):
    return queryset.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]


def calculate_account_balance(account, cutoff_date=None):
    if not account.include_in_balance and account.account_type != "card":
        return ZERO

    cutoff_date = cutoff_date or timezone.localdate()

    posted_transactions = account.transactions.filter(
        is_cleared=True,
        is_ignored=False,
        date__lte=cutoff_date,
    )
    incoming_transfers = account.incoming_transfers.filter(
        transaction_type=Transaction.TransactionType.TRANSFER,
        is_cleared=True,
        is_ignored=False,
        date__lte=cutoff_date,
    )

    income = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.INCOME)
    )
    expense = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.EXPENSE)
    )
    outgoing_transfers = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.TRANSFER)
    )
    incoming_total = _sum_amount(incoming_transfers)

    return (
        account.initial_balance
        + income
        + incoming_total
        - expense
        - outgoing_transfers
    )


def calculate_user_balance(user, cutoff_date, tenant=None):
    tenant = resolve_tenant(tenant=tenant, user=user)
    account_model = apps.get_model("accounts", "Account")
    active_accounts = account_model.objects.filter(
        tenant=tenant,
        is_active=True,
        include_in_balance=True,
        account_type__in=["bank", "cash"],
    )
    total_balance = ZERO
    for account in active_accounts:
        total_balance += calculate_account_balance(account, cutoff_date=cutoff_date)
    return total_balance


def calculate_single_card_total_limit(card, selected_month):
    """Limite total utilizavel de um cartao no mes, antes dos gastos."""
    monthly_limit_model = apps.get_model("accounts", "CardMonthlyLimit")
    transaction_model = apps.get_model("transactions", "Transaction")
    tenant = card.tenant
    today = timezone.localdate()
    is_current_month = (
        selected_month.year == today.year and selected_month.month == today.month
    )

    monthly_limit = monthly_limit_model.objects.filter(
        tenant=tenant,
        account=card,
        year=selected_month.year,
        month=selected_month.month,
    ).values_list("amount", flat=True).first()

    if monthly_limit is not None and monthly_limit > 0:
        return monthly_limit
    if not is_current_month:
        return None
    if card.backing_investment_id:
        return max(ZERO, card.backing_investment.net_invested)
    if card.credit_limit is not None and card.credit_limit > 0:
        return card.credit_limit

    monthly_income = transaction_model.objects.filter(
        tenant=tenant,
        account=card,
        is_cleared=True,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
        transaction_type=Transaction.TransactionType.INCOME,
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
    monthly_incoming_transfers = transaction_model.objects.filter(
        tenant=tenant,
        destination_account=card,
        is_cleared=True,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
        transaction_type=Transaction.TransactionType.TRANSFER,
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

    card_limit = card.initial_balance + monthly_income + monthly_incoming_transfers
    return card_limit if card_limit > ZERO else None


def calculate_single_card_available_limit(card, selected_month):
    """Limite disponivel de um cartao especifico no mes informado.

    Ao contrario de calculate_credit_card_available_limit (que soma varios
    cartoes de um tenant e descarta resultados negativos/meses sem limite
    explicito), esta funcao devolve o valor "cru" - inclusive negativo, se o
    cartao estourou o limite no mes - porque e usada tambem pra exibicao
    individual do cartao (ex: tela de Contas), onde "None"/negativo e uma
    informacao relevante pro usuario, nao um caso a ser silenciosamente
    ignorado.

    Retorna None quando o mes nao e o atual e nao ha limite mensal explicito
    cadastrado (CardMonthlyLimit) - nesse caso nao ha como saber o limite
    daquele mes especifico.
    """
    transaction_model = apps.get_model("transactions", "Transaction")
    tenant = card.tenant

    monthly_incoming_transfers = transaction_model.objects.filter(
        tenant=tenant,
        destination_account=card,
        is_cleared=True,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
        transaction_type=Transaction.TransactionType.TRANSFER,
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

    card_limit = calculate_single_card_total_limit(card, selected_month)
    if card_limit is None:
        return None

    monthly_limit_model = apps.get_model("accounts", "CardMonthlyLimit")
    monthly_limit = monthly_limit_model.objects.filter(
        tenant=tenant,
        account=card,
        year=selected_month.year,
        month=selected_month.month,
    ).values_list("amount", flat=True).first()
    uses_dynamic_limit = (
        monthly_limit is None
        and not card.backing_investment_id
        and not (card.credit_limit is not None and card.credit_limit > 0)
    )
    if uses_dynamic_limit:
        monthly_incoming_transfers = ZERO

    monthly_expenses = transaction_model.objects.filter(
        tenant=tenant,
        account=card,
        is_cleared=True,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
        transaction_type=Transaction.TransactionType.EXPENSE,
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

    return card_limit - monthly_expenses + monthly_incoming_transfers


def calculate_credit_card_available_limit(tenant, selected_month):
    account_model = apps.get_model("accounts", "Account")

    active_cards = account_model.objects.filter(
        tenant=tenant,
        account_type="card",
        is_active=True,
    ).select_related("backing_investment")

    total_available = ZERO
    for card in active_cards:
        available = calculate_single_card_available_limit(card, selected_month)
        if available is not None and available > 0:
            total_available += available

    return total_available


def calculate_credit_card_total_limit(tenant, selected_month):
    account_model = apps.get_model("accounts", "Account")

    active_cards = account_model.objects.filter(
        tenant=tenant,
        account_type="card",
        is_active=True,
    ).select_related("backing_investment")

    total_limit = ZERO
    for card in active_cards:
        limit_value = calculate_single_card_total_limit(card, selected_month)
        if limit_value is not None and limit_value > 0:
            total_limit += limit_value

    return total_limit


def calculate_monthly_balance(user, selected_month, account=None, category=None, tenant=None):
    tenant = resolve_tenant(tenant=tenant, user=user)
    monthly_transactions = Transaction.objects.filter(
        tenant=tenant,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
    )

    if category:
        monthly_transactions = monthly_transactions.filter(category=category)

    if account:
        if not account.include_in_balance:
            return ZERO

        income = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.INCOME,
                account=account,
            )
        )
        expense = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.EXPENSE,
                account=account,
            )
        )
        outgoing_transfers = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.TRANSFER,
                account=account,
            )
        )
        incoming_transfers = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.TRANSFER,
                destination_account=account,
            )
        )

        return income + incoming_transfers - expense - outgoing_transfers

    income = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.INCOME
        ).filter(account__include_in_balance=True)
    )
    expense = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE
        ).filter(account__include_in_balance=True)
    )
    outgoing_transfers = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.TRANSFER
        ).filter(account__include_in_balance=True)
    )
    incoming_transfers = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.TRANSFER
        ).filter(destination_account__include_in_balance=True)
    )

    return income + incoming_transfers - expense - outgoing_transfers
