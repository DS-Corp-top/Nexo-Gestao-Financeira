"""Report endpoints — aggregated financial data for an arbitrary date range.

Unlike DashboardView (always a closed calendar month), these accept a free
date_start/date_end range chosen by the user in the Reports page.
"""

from datetime import date as date_cls, timedelta
from decimal import Decimal

from django.db.models import DecimalField, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from categories.models import Category
from common.api_mixins import get_user_tenant, is_view_only_superuser, set_mask_financial_values
from common.balance import calculate_account_balance, calculate_user_balance
from common.months import month_value_to_date
from investments.models import Investment, InvestmentEntry
from transactions.models import Transaction

from . import diagnosis

ZERO = Decimal("0.00")
TWO_PLACES = Decimal("0.01")
AMOUNT_FIELD = DecimalField(max_digits=12, decimal_places=2)

# "cleared" (baixadas) e o default histórico dos relatórios — só o que já
# foi conciliado com a conta real. "pending" (provisões) mostra só o que
# ainda não baixou. "all" soma as duas coisas.
STATUS_CHOICES = {"cleared", "pending", "all"}


def _parse_status(request):
    status = request.query_params.get("status", "cleared")
    if status not in STATUS_CHOICES:
        raise ValidationError({"status": "Valor inválido — use 'cleared', 'pending' ou 'all'."})
    return status


def _money(value):
    """Render a Decimal as a "X.XX" string for the API response.

    SQLite (used in CI; Postgres is used locally via Docker) doesn't
    preserve decimal_places through Coalesce(Sum(...), 0.00) when the
    aggregate matches zero rows — it comes back as Decimal('0') instead of
    Decimal('0.00'), even with output_field pinned to a DecimalField. str()
    on an unscaled Decimal drops the trailing zeros ("0" instead of "0.00"),
    which breaks any consumer expecting a fixed 2-decimal money string.
    Quantizing before str() fixes it regardless of backend.
    """
    return str(value.quantize(TWO_PLACES))


def _sum_amount(queryset):
    return queryset.aggregate(total=Coalesce(Sum("amount"), ZERO, output_field=AMOUNT_FIELD))["total"]


def _parse_date(raw_value, field_name):
    if not raw_value:
        raise ValidationError({field_name: "Este campo é obrigatório (formato YYYY-MM-DD)."})
    try:
        return date_cls.fromisoformat(raw_value)
    except ValueError:
        raise ValidationError({field_name: "Data inválida — use o formato YYYY-MM-DD."})


def _parse_date_range(request):
    date_start = _parse_date(request.query_params.get("date_start"), "date_start")
    date_end = _parse_date(request.query_params.get("date_end"), "date_end")
    if date_end < date_start:
        raise ValidationError({"date_end": "date_end não pode ser anterior a date_start."})
    return date_start, date_end


class TransactionsReportView(APIView):
    """GET /api/v1/reports/transactions/?date_start&date_end&account&category&type&status"""

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        date_start, date_end = _parse_date_range(request)
        status = _parse_status(request)

        account_id = request.query_params.get("account")
        category_id = request.query_params.get("category")
        transaction_type = request.query_params.get("type")

        qs = Transaction.objects.filter(tenant=tenant, date__gte=date_start, date__lte=date_end)

        account = None
        if account_id:
            account = Account.objects.filter(pk=account_id, tenant=tenant).first()
            if account is None:
                raise ValidationError({"account": "Conta não encontrada."})
            qs = qs.filter(account=account)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if transaction_type in (Transaction.TransactionType.INCOME, Transaction.TransactionType.EXPENSE):
            qs = qs.filter(transaction_type=transaction_type)

        qs = qs.select_related("account", "category").order_by("date", "created_at")

        if account is not None:
            opening_balance = calculate_account_balance(account, cutoff_date=date_start - timedelta(days=1), status=status)
            closing_balance = calculate_account_balance(account, cutoff_date=date_end, status=status)
        else:
            opening_balance = calculate_user_balance(
                request.user, cutoff_date=date_start - timedelta(days=1), tenant=tenant, status=status
            )
            closing_balance = calculate_user_balance(request.user, cutoff_date=date_end, tenant=tenant, status=status)

        # Totais do periodo usam o mesmo "status" do saldo acima — senao uma
        # despesa provisionada aparece no total sem refletir no saldo (ou
        # vice-versa).
        posted_qs = qs.filter(is_ignored=False)
        if status == "cleared":
            posted_qs = posted_qs.filter(is_cleared=True)
        elif status == "pending":
            posted_qs = posted_qs.filter(is_cleared=False)
        if account is None:
            posted_qs = posted_qs.filter(
                account__is_active=True,
                account__include_in_balance=True,
                account__account_type__in=["bank", "cash"],
            )
        total_income = _sum_amount(posted_qs.filter(transaction_type=Transaction.TransactionType.INCOME))
        total_expense = _sum_amount(posted_qs.filter(transaction_type=Transaction.TransactionType.EXPENSE))

        transactions = [] if masked else [
            {
                "id": t.pk,
                "date": t.date.isoformat(),
                "description": t.description or "Sem descrição",
                "transaction_type": t.transaction_type,
                "amount": _money(t.amount),
                "account": t.account.name if t.account else None,
                "category": t.category.name if t.category else None,
                "is_cleared": t.is_cleared,
            }
            for t in qs
        ]

        return Response({
            "date_start": date_start.isoformat(),
            "date_end": date_end.isoformat(),
            "account": account.name if account else None,
            "status": status,
            "opening_balance": _money(opening_balance),
            "closing_balance": _money(closing_balance),
            "total_income": _money(total_income),
            "total_expense": _money(total_expense),
            "transactions": transactions,
        })


class AccountsReportView(APIView):
    """GET /api/v1/reports/accounts/?date_start&date_end&status

    Saldo de abertura/fechamento e movimentação do período para cada conta
    ativa do tenant — como TransactionsReportView com account=<id>, mas para
    todas as contas de uma vez em vez de uma por vez.
    """

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        date_start, date_end = _parse_date_range(request)
        status = _parse_status(request)

        accounts = []
        for account in Account.objects.filter(tenant=tenant, is_active=True).order_by("name"):
            # O "status" usado nos totais abaixo precisa ser o mesmo passado
            # pro calculate_account_balance — senao uma despesa provisionada
            # entra no total sem refletir no saldo (ou vice-versa).
            movements = Transaction.objects.filter(
                tenant=tenant,
                account=account,
                is_ignored=False,
                date__gte=date_start,
                date__lte=date_end,
            )
            if status == "cleared":
                movements = movements.filter(is_cleared=True)
            elif status == "pending":
                movements = movements.filter(is_cleared=False)
            total_income = _sum_amount(movements.filter(transaction_type=Transaction.TransactionType.INCOME))
            total_expense = _sum_amount(movements.filter(transaction_type=Transaction.TransactionType.EXPENSE))
            opening_balance = calculate_account_balance(account, cutoff_date=date_start - timedelta(days=1), status=status)
            closing_balance = calculate_account_balance(account, cutoff_date=date_end, status=status)

            accounts.append({
                "id": account.pk,
                "name": account.name,
                "account_type": account.account_type,
                "account_type_display": account.get_account_type_display(),
                "opening_balance": _money(opening_balance),
                "total_income": _money(total_income),
                "total_expense": _money(total_expense),
                "closing_balance": _money(closing_balance),
            })

        total_opening_balance = sum((Decimal(a["opening_balance"]) for a in accounts), ZERO)
        total_closing_balance = sum((Decimal(a["closing_balance"]) for a in accounts), ZERO)
        total_income = sum((Decimal(a["total_income"]) for a in accounts), ZERO)
        total_expense = sum((Decimal(a["total_expense"]) for a in accounts), ZERO)

        return Response({
            "date_start": date_start.isoformat(),
            "date_end": date_end.isoformat(),
            "status": status,
            "accounts": [] if masked else accounts,
            "total_opening_balance": _money(total_opening_balance),
            "total_closing_balance": _money(total_closing_balance),
            "total_income": _money(total_income),
            "total_expense": _money(total_expense),
        })


class SummaryReportView(APIView):
    """GET /api/v1/reports/summary/?date_start&date_end&type"""

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        date_start, date_end = _parse_date_range(request)

        qs = Transaction.objects.filter(
            tenant=tenant,
            is_ignored=False,
            date__gte=date_start,
            date__lte=date_end,
        )

        transaction_type = request.query_params.get("type")
        if transaction_type in (Transaction.TransactionType.INCOME, Transaction.TransactionType.EXPENSE):
            qs = qs.filter(transaction_type=transaction_type)

        total_income = _sum_amount(qs.filter(transaction_type=Transaction.TransactionType.INCOME))
        total_expense = _sum_amount(qs.filter(transaction_type=Transaction.TransactionType.EXPENSE))

        expense_by_category = [
            {"name": row["category__name"] or "Sem categoria", "total": _money(row["total"])}
            for row in qs.filter(transaction_type=Transaction.TransactionType.EXPENSE)
            .values("category__name")
            .annotate(total=Coalesce(Sum("amount"), ZERO, output_field=AMOUNT_FIELD))
            .order_by("-total")
        ]
        income_by_category = [
            {"name": row["category__name"] or "Sem categoria", "total": _money(row["total"])}
            for row in qs.filter(transaction_type=Transaction.TransactionType.INCOME)
            .values("category__name")
            .annotate(total=Coalesce(Sum("amount"), ZERO, output_field=AMOUNT_FIELD))
            .order_by("-total")
        ]

        return Response({
            "date_start": date_start.isoformat(),
            "date_end": date_end.isoformat(),
            "total_income": _money(total_income),
            "total_expense": _money(total_expense),
            "balance": _money(total_income - total_expense),
            "expense_by_category": [] if masked else expense_by_category,
            "income_by_category": [] if masked else income_by_category,
        })


class InvestmentsReportView(APIView):
    """GET /api/v1/reports/investments/?date_start&date_end&investment_type"""

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        date_start, date_end = _parse_date_range(request)

        investments_qs = Investment.objects.filter(tenant=tenant)
        investment_type = request.query_params.get("investment_type")
        if investment_type:
            investments_qs = investments_qs.filter(investment_type=investment_type)

        entries_qs = InvestmentEntry.objects.filter(
            tenant=tenant, date__gte=date_start, date__lte=date_end
        )

        def _sum_for(investment_id, entry_types):
            return _sum_amount(
                entries_qs.filter(investment_id=investment_id, entry_type__in=entry_types)
            )

        investments = []
        for investment in investments_qs.order_by("name"):
            deposited = _sum_for(investment.pk, [InvestmentEntry.EntryType.DEPOSIT])
            withdrawn = _sum_for(investment.pk, [InvestmentEntry.EntryType.WITHDRAWAL])
            earnings = _sum_for(
                investment.pk, [InvestmentEntry.EntryType.DIVIDEND, InvestmentEntry.EntryType.YIELD]
            )
            if deposited == ZERO and withdrawn == ZERO and earnings == ZERO:
                continue
            investments.append({
                "id": investment.pk,
                "name": investment.name,
                "investment_type": investment.investment_type,
                "investment_type_display": investment.get_investment_type_display(),
                "broker": investment.broker,
                "total_invested": _money(deposited),
                "total_withdrawn": _money(withdrawn),
                "total_earnings": _money(earnings),
                "net_invested": _money(deposited - withdrawn),
            })

        total_invested = sum((Decimal(i["total_invested"]) for i in investments), ZERO)
        total_withdrawn = sum((Decimal(i["total_withdrawn"]) for i in investments), ZERO)
        total_earnings = sum((Decimal(i["total_earnings"]) for i in investments), ZERO)

        return Response({
            "date_start": date_start.isoformat(),
            "date_end": date_end.isoformat(),
            "investments": [] if masked else investments,
            "total_invested": _money(total_invested),
            "total_withdrawn": _money(total_withdrawn),
            "total_earnings": _money(total_earnings),
            "net_invested": _money(total_invested - total_withdrawn),
        })


class DREReportView(APIView):
    """GET /api/v1/reports/dre/?date_start&date_end

    DRE Gerencial no padrao contabil, montado inteiramente sobre
    Transacoes (nao usa Fatura de Servico):

        Receita Bruta
        (-) Custo do Servico/Produto   [categorias de despesa com expense_kind=cost]
        = Lucro Bruto
        (-) Despesas Operacionais       [demais categorias de despesa]
        = Resultado Liquido do periodo

    A separacao Custo x Despesa Operacional vem de Category.expense_kind
    (ver categories/models.py). Categorias de despesa sem essa marcacao
    explicita (default) caem em Despesa Operacional.
    """

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        date_start, date_end = _parse_date_range(request)

        income_qs = Transaction.objects.filter(
            tenant=tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            is_ignored=False,
            date__gte=date_start,
            date__lte=date_end,
        )
        total_income = _sum_amount(income_qs)

        expense_qs = Transaction.objects.filter(
            tenant=tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_ignored=False,
            date__gte=date_start,
            date__lte=date_end,
        )
        cost_qs = expense_qs.filter(category__expense_kind=Category.ExpenseKind.COST)
        operating_qs = expense_qs.exclude(category__expense_kind=Category.ExpenseKind.COST)

        def _by_category(qs):
            return [
                {"name": row["category__name"] or "Sem categoria", "total": _money(row["total"])}
                for row in qs.values("category__name")
                .annotate(total=Coalesce(Sum("amount"), ZERO, output_field=AMOUNT_FIELD))
                .order_by("-total")
            ]

        costs_by_category = _by_category(cost_qs)
        operating_by_category = _by_category(operating_qs)

        total_cost = _sum_amount(cost_qs)
        total_operating_expenses = _sum_amount(operating_qs)

        gross_profit = total_income - total_cost
        net_result = gross_profit - total_operating_expenses

        return Response({
            "date_start": date_start.isoformat(),
            "date_end": date_end.isoformat(),
            "total_income": _money(total_income),
            "costs_by_category": [] if masked else costs_by_category,
            "total_cost": _money(total_cost),
            "gross_profit": _money(gross_profit),
            "operating_expenses": [] if masked else operating_by_category,
            "total_operating_expenses": _money(total_operating_expenses),
            "net_result": _money(net_result),
        })


def _parse_month(raw_value, field_name):
    if not raw_value:
        return timezone.localdate().replace(day=1)
    month = month_value_to_date(raw_value)
    if month is None:
        raise ValidationError({field_name: "Mês inválido — use o formato YYYY-MM."})
    return month


def _parse_int(raw_value, field_name, default, minimum, maximum):
    if raw_value in (None, ""):
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        raise ValidationError({field_name: "Informe um número inteiro."})
    if not minimum <= value <= maximum:
        raise ValidationError({field_name: f"Use um valor entre {minimum} e {maximum}."})
    return value


def _parse_flow_status(request):
    # Diferente dos outros relatórios, o default aqui é "all": o objetivo é
    # enxergar também o que já está provisionado para os meses futuros.
    status = request.query_params.get("status", "all")
    if status not in STATUS_CHOICES:
        raise ValidationError({"status": "Valor inválido — use 'cleared', 'pending' ou 'all'."})
    return status


def _ratio(value):
    return None if value is None else float(round(value, 4))


def _driver_payload(driver):
    return {
        "category_id": driver["category_id"],
        "name": driver["name"],
        "current": _money(driver["current"]),
        "average": _money(driver["average"]),
        "delta": _money(driver["delta"]),
        "delta_ratio": _ratio(driver["delta_ratio"]),
        "is_new": driver["is_new"],
    }


class OscillationsReportView(APIView):
    """GET /api/v1/reports/oscillations/?end_month=YYYY-MM&months=12&status=all

    Receitas, despesas e saldo mês a mês, com cada mês sinalizado como
    "heavy" (despesa acima do normal), "surplus" (sobra acima do normal),
    "deficit" (saldo negativo), "normal" ou "empty". Ver reports/diagnosis.py.
    """

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        end_month = _parse_month(request.query_params.get("end_month"), "end_month")
        months = _parse_int(request.query_params.get("months"), "months", default=12, minimum=3, maximum=36)
        status = _parse_flow_status(request)

        if masked:
            # Superusuário sem vínculo com o tenant: nada de valores.
            return Response({"end_month": end_month.strftime("%Y-%m"), "status": status, "masked": True, "months": []})

        series = diagnosis.build_monthly_series(tenant, end_month, months, status)
        return Response({
            "end_month": end_month.strftime("%Y-%m"),
            "status": status,
            "masked": False,
            "average_income": _money(series["average_income"]),
            "average_expense": _money(series["average_expense"]),
            "average_net": _money(series["average_balance"]),
            "months": [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "income": _money(row["income"]),
                    "expense": _money(row["expense"]),
                    "net": _money(row["balance"]),
                    "expense_vs_average": _ratio(row["expense_vs_average"]),
                    "flag": row["flag"],
                }
                for row in series["months"]
            ],
        })


class MonthDiagnosisReportView(APIView):
    """GET /api/v1/reports/oscillations/diagnosis/?month=YYYY-MM&baseline_months=6&status=all

    Explica um mês: compara com a média dos meses anteriores e aponta o que
    pesou, o que aliviou, gastos pontuais, parcelamentos e pendências.
    """

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        masked = is_view_only_superuser(request.user, tenant)
        set_mask_financial_values(request, masked)
        month = _parse_month(request.query_params.get("month"), "month")
        baseline_months = _parse_int(
            request.query_params.get("baseline_months"), "baseline_months", default=6, minimum=1, maximum=24
        )
        status = _parse_flow_status(request)

        if masked:
            # O diagnóstico é feito de valores e de frases com valores — não sai nada.
            return Response({"month": month.strftime("%Y-%m"), "status": status, "masked": True})

        result = diagnosis.build_month_diagnosis(tenant, month, baseline_months, status)
        baseline = result["baseline"]
        return Response({
            "month": month.strftime("%Y-%m"),
            "status": status,
            "masked": False,
            "income": _money(result["income"]),
            "expense": _money(result["expense"]),
            "net": _money(result["balance"]),
            "savings_rate": _ratio(result["savings_rate"]),
            "baseline": {
                "months": baseline["months"],
                "requested_months": baseline["requested_months"],
                "income": _money(baseline["income"]),
                "expense": _money(baseline["expense"]),
                "net": _money(baseline["balance"]),
            },
            "verdict": result["verdict"],
            "insights": result["insights"],
            "expense_increases": [_driver_payload(d) for d in result["expense_increases"]],
            "expense_decreases": [_driver_payload(d) for d in result["expense_decreases"]],
            "income_changes": [_driver_payload(d) for d in result["income_changes"]],
            "composition": [
                {
                    "kind": c["kind"],
                    "label": c["label"],
                    "value": _money(c["amount"]),
                    "count": c["count"],
                    "share": _ratio(c["share"]),
                }
                for c in result["composition"]
            ],
            "card_expense": _money(result["card_expense"]),
            "pending_expense": _money(result["pending_expense"]),
            "top_expenses": [
                {
                    "id": t["id"],
                    "date": t["date"].isoformat(),
                    "description": t["description"],
                    "category": t["category"],
                    "account": t["account"],
                    "value": _money(t["amount"]),
                    "kind": t["kind"],
                    "is_cleared": t["is_cleared"],
                    "share": _ratio(t["share"]),
                }
                for t in result["top_expenses"]
            ],
        })
