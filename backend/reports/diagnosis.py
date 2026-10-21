"""Diagnóstico financeiro — oscilações mês a mês e o "porquê" de cada mês.

Duas perguntas que este módulo responde:

1. Como receitas, despesas e saldo oscilaram ao longo dos meses?
   (build_monthly_series)
2. Por que um mês específico pesou — ou sobrou dinheiro?
   (build_month_diagnosis)

O "normal" de comparação (baseline) é a média dos meses anteriores que tiveram
alguma movimentação. Meses sem nenhum lançamento ficam fora da média, senão um
usuário recém-cadastrado teria uma média artificialmente baixa.

Critério de receita/despesa igual ao DashboardView: transferências ficam de
fora, transações ignoradas não contam, receitas lançadas em cartão de crédito
não contam (não é dinheiro em conta) e despesas no cartão contam normalmente.
"""

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth

from accounts.models import Account
from common.months import shift_month
from transactions.models import Transaction

ZERO = Decimal("0.00")
AMOUNT_FIELD = DecimalField(max_digits=14, decimal_places=2)

INCOME = Transaction.TransactionType.INCOME
EXPENSE = Transaction.TransactionType.EXPENSE
RecurrenceType = Transaction.RecurrenceType

# Variação (sobre a média) a partir da qual o mês é sinalizado como fora do normal.
SIGNIFICANT_CHANGE = Decimal("0.15")
# Variação mínima para uma oscilação de receita/despesa virar comentário.
NOTABLE_CHANGE = Decimal("0.10")
# Um gasto pontual que concentra essa fração das despesas do mês vira alerta.
ONE_OFF_SHARE = Decimal("0.20")
# Parcelamentos acima dessa fração das despesas viram alerta.
INSTALLMENT_SHARE = Decimal("0.25")
# Taxa de poupança considerada saudável.
HEALTHY_SAVINGS_RATE = Decimal("0.20")
# Abaixo dessa taxa de poupança o mês é sinalizado como "margem apertada".
TIGHT_SAVINGS_RATE = Decimal("0.05")
# Gastos recorrentes acima dessa fração da receita viram alerta.
RECURRING_INCOME_SHARE = Decimal("0.70")
# Uma categoria só é citada como "pesou"/"aliviou" se a variação for ao menos
# essa fração da despesa média do mês (evita citar R$ 3 de diferença).
DRIVER_MIN_SHARE = Decimal("0.03")
MAX_DRIVERS = 5
MAX_TOP_EXPENSES = 5

RECURRING_TYPES = {
    RecurrenceType.FIXED,
    RecurrenceType.MONTHLY,
    RecurrenceType.QUARTERLY,
    RecurrenceType.YEARLY,
}

MONTH_NAMES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def month_label(month):
    return f"{MONTH_NAMES[month.month - 1]}/{month.year}"


def brl(value):
    """Formata um Decimal como moeda brasileira: R$ 1.234,56."""
    quantized = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if quantized < 0 else ""
    integer, cents = f"{abs(quantized):.2f}".split(".")
    integer = f"{int(integer):,}".replace(",", ".")
    return f"{sign}R$ {integer},{cents}"


def pct(value):
    """Formata uma fração (0.153) como percentual inteiro ("15%")."""
    return f"{(abs(value) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)}%"


def baseline_phrase(count):
    """O "normal" de comparação, já com artigo: "a média dos últimos 3 meses"."""
    return f"a média dos últimos {count} meses" if count > 1 else "o mês anterior com movimentação"


def baseline_phrase_of(count):
    """Mesma frase contraída com "de": "da média..." / "do mês anterior..."."""
    return "d" + baseline_phrase(count)


def ratio(part, whole):
    if not whole:
        return None
    return part / whole


def _flow_queryset(tenant, date_start, date_end, status):
    """Transações que contam como receita/despesa num intervalo [start, end)."""
    qs = Transaction.objects.filter(
        tenant=tenant,
        is_ignored=False,
        date__gte=date_start,
        date__lt=date_end,
        transaction_type__in=[INCOME, EXPENSE],
    ).exclude(transaction_type=INCOME, account__account_type=Account.AccountType.CARD)
    if status == "cleared":
        qs = qs.filter(is_cleared=True)
    elif status == "pending":
        qs = qs.filter(is_cleared=False)
    return qs


def _monthly_totals(qs):
    """{date(primeiro dia do mês): {"income": Decimal, "expense": Decimal}}."""
    rows = (
        qs.annotate(month=TruncMonth("date"))
        .values("month")
        .annotate(
            income=Coalesce(Sum("amount", filter=Q(transaction_type=INCOME)), ZERO, output_field=AMOUNT_FIELD),
            expense=Coalesce(Sum("amount", filter=Q(transaction_type=EXPENSE)), ZERO, output_field=AMOUNT_FIELD),
        )
    )
    totals = {}
    for row in rows:
        month = row["month"]
        # TruncMonth em DateField devolve date; em alguns backends, datetime.
        month = month.date() if hasattr(month, "date") and callable(month.date) else month
        totals[month.replace(day=1)] = {"income": row["income"], "expense": row["expense"]}
    return totals


def _average(values):
    values = list(values)
    if not values:
        return ZERO
    return sum(values, ZERO) / len(values)


def _classify_month(income, expense, avg_expense, avg_balance, avg_income):
    balance = income - expense
    if income == ZERO and expense == ZERO:
        return "empty"
    if balance < ZERO:
        return "deficit"
    if avg_expense > ZERO and expense >= avg_expense * (1 + SIGNIFICANT_CHANGE):
        return "heavy"
    if avg_income > ZERO and balance >= avg_balance + avg_income * SIGNIFICANT_CHANGE:
        return "surplus"
    return "normal"


def build_monthly_series(tenant, end_month, months, status):
    """Série mensal de receitas/despesas/saldo terminando em end_month (inclusive)."""
    start_month = shift_month(end_month, -(months - 1))
    totals = _monthly_totals(_flow_queryset(tenant, start_month, shift_month(end_month, 1), status))

    active = [t for t in totals.values() if t["income"] or t["expense"]]
    avg_income = _average(t["income"] for t in active)
    avg_expense = _average(t["expense"] for t in active)
    avg_balance = avg_income - avg_expense

    series = []
    for offset in range(months):
        month = shift_month(start_month, offset)
        income = totals.get(month, {}).get("income", ZERO)
        expense = totals.get(month, {}).get("expense", ZERO)
        balance = income - expense
        series.append({
            "month": month,
            "income": income,
            "expense": expense,
            "balance": balance,
            "expense_vs_average": ratio(expense - avg_expense, avg_expense),
            "flag": _classify_month(income, expense, avg_expense, avg_balance, avg_income),
        })

    return {
        "months": series,
        "average_income": avg_income,
        "average_expense": avg_expense,
        "average_balance": avg_balance,
    }


def _category_totals(qs):
    """{(categoria_id, nome): Decimal} por tipo de transação."""
    by_type = {INCOME: {}, EXPENSE: {}}
    rows = (
        qs.values("transaction_type", "category_id", "category__name")
        .annotate(total=Coalesce(Sum("amount"), ZERO, output_field=AMOUNT_FIELD))
    )
    for row in rows:
        key = (row["category_id"], row["category__name"] or "Sem categoria")
        by_type[row["transaction_type"]][key] = row["total"]
    return by_type


def _drivers(current, baseline_sum, baseline_months):
    """Variação por categoria entre o mês e a média do baseline."""
    drivers = []
    for key in set(current) | set(baseline_sum):
        category_id, name = key
        value = current.get(key, ZERO)
        average = baseline_sum.get(key, ZERO) / baseline_months if baseline_months else ZERO
        delta = value - average
        drivers.append({
            "category_id": category_id,
            "name": name,
            "current": value,
            "average": average,
            "delta": delta,
            "delta_ratio": ratio(delta, average),
            "is_new": average == ZERO and value > ZERO,
        })
    return drivers


def _recurrence_bucket(transaction):
    if transaction.recurrence_type == RecurrenceType.INSTALLMENT:
        return "installment"
    if transaction.recurrence_type in RECURRING_TYPES:
        return "recurring"
    return "one_off"


def build_month_diagnosis(tenant, month, baseline_months, status):
    month_end = shift_month(month, 1)
    baseline_start = shift_month(month, -baseline_months)

    month_qs = _flow_queryset(tenant, month, month_end, status)
    baseline_qs = _flow_queryset(tenant, baseline_start, month, status)

    month_totals = _monthly_totals(month_qs).get(month, {"income": ZERO, "expense": ZERO})
    income, expense = month_totals["income"], month_totals["expense"]
    balance = income - expense

    baseline_totals = _monthly_totals(baseline_qs)
    active_baseline = [t for t in baseline_totals.values() if t["income"] or t["expense"]]
    baseline_count = len(active_baseline)
    avg_income = _average(t["income"] for t in active_baseline)
    avg_expense = _average(t["expense"] for t in active_baseline)
    avg_balance = avg_income - avg_expense

    month_by_category = _category_totals(month_qs)
    baseline_by_category = _category_totals(baseline_qs)
    expense_drivers = _drivers(month_by_category[EXPENSE], baseline_by_category[EXPENSE], baseline_count)
    income_drivers = _drivers(month_by_category[INCOME], baseline_by_category[INCOME], baseline_count)

    driver_floor = max(avg_expense, expense) * DRIVER_MIN_SHARE
    expense_up = sorted(
        (d for d in expense_drivers if d["delta"] > ZERO and d["delta"] >= driver_floor),
        key=lambda d: d["delta"], reverse=True,
    )[:MAX_DRIVERS]
    expense_down = sorted(
        (d for d in expense_drivers if d["delta"] < ZERO and -d["delta"] >= driver_floor),
        key=lambda d: d["delta"],
    )[:MAX_DRIVERS]
    income_changes = sorted(
        (d for d in income_drivers if d["delta"] != ZERO and abs(d["delta"]) >= driver_floor),
        key=lambda d: abs(d["delta"]), reverse=True,
    )[:MAX_DRIVERS]
    if not baseline_count:
        # Sem histórico não há "a mais" nem "a menos" — tudo seria "novo".
        expense_up, expense_down, income_changes = [], [], []

    expenses = list(
        month_qs.filter(transaction_type=EXPENSE)
        .select_related("category", "account")
        .order_by("-amount", "date")
    )
    composition = defaultdict(lambda: ZERO)
    composition_count = defaultdict(int)
    card_expense = ZERO
    pending_expense = ZERO
    for t in expenses:
        bucket = _recurrence_bucket(t)
        composition[bucket] += t.amount
        composition_count[bucket] += 1
        if t.account.account_type == Account.AccountType.CARD:
            card_expense += t.amount
        if not t.is_cleared:
            pending_expense += t.amount

    top_expenses = [
        {
            "id": t.pk,
            "date": t.date,
            "description": t.display_title,
            "category": t.category.name if t.category else None,
            "account": t.account.name,
            "amount": t.amount,
            "kind": _recurrence_bucket(t),
            "is_cleared": t.is_cleared,
            "share": ratio(t.amount, expense),
        }
        for t in expenses[:MAX_TOP_EXPENSES]
    ]

    context = {
        "month": month,
        "income": income,
        "expense": expense,
        "balance": balance,
        "baseline_count": baseline_count,
        "avg_income": avg_income,
        "avg_expense": avg_expense,
        "avg_balance": avg_balance,
        "expense_up": expense_up,
        "expense_down": expense_down,
        "income_changes": income_changes,
        "new_expenses": [d for d in expense_drivers if d["is_new"]] if baseline_count else [],
        "composition": composition,
        "top_expenses": top_expenses,
        "card_expense": card_expense,
        "pending_expense": pending_expense,
    }

    return {
        "month": month,
        "status": status,
        "income": income,
        "expense": expense,
        "balance": balance,
        "savings_rate": ratio(balance, income),
        "baseline": {
            "months": baseline_count,
            "requested_months": baseline_months,
            "income": avg_income,
            "expense": avg_expense,
            "balance": avg_balance,
        },
        "verdict": _verdict(context),
        "insights": _insights(context),
        "expense_increases": expense_up,
        "expense_decreases": expense_down,
        "income_changes": income_changes,
        "composition": [
            {"kind": kind, "label": label, "amount": composition[kind], "count": composition_count[kind],
             "share": ratio(composition[kind], expense)}
            for kind, label in (
                ("recurring", "Fixas e recorrentes"),
                ("installment", "Parcelamentos"),
                ("one_off", "Pontuais"),
            )
        ],
        "card_expense": card_expense,
        "pending_expense": pending_expense,
        "top_expenses": top_expenses,
    }


def _verdict(ctx):
    income, expense, balance = ctx["income"], ctx["expense"], ctx["balance"]
    label = month_label(ctx["month"])

    if income == ZERO and expense == ZERO:
        return {
            "level": "empty",
            "title": "Sem movimentação",
            "summary": f"Nenhuma receita ou despesa registrada em {label}.",
        }

    if balance < ZERO:
        return {
            "level": "critical",
            "title": "Mês no vermelho",
            "summary": f"As despesas superaram as receitas em {brl(-balance)}.",
        }

    # Daqui em diante saldo >= 0 com movimentação, logo receita > 0.
    savings_rate = balance / income

    has_baseline = ctx["baseline_count"] > 0
    expense_jump = ratio(expense - ctx["avg_expense"], ctx["avg_expense"]) if has_baseline else None
    if expense_jump is not None and expense_jump >= SIGNIFICANT_CHANGE:
        return {
            "level": "attention",
            "title": "Despesas acima do normal",
            "summary": (
                f"Você gastou {pct(expense_jump)} a mais que {baseline_phrase(ctx['baseline_count'])}, "
                f"mas ainda fechou positivo em {brl(balance)}."
            ),
        }

    above_normal = has_baseline and ctx["avg_income"] > ZERO and (
        balance >= ctx["avg_balance"] + ctx["avg_income"] * SIGNIFICANT_CHANGE
    )
    if above_normal or (not has_baseline and savings_rate >= HEALTHY_SAVINGS_RATE):
        summary = f"Sobraram {brl(balance)} ({pct(savings_rate)} da receita)"
        if has_baseline:
            summary += f", contra uma sobra média de {brl(ctx['avg_balance'])}"
        return {"level": "excellent", "title": "Sobra acima do normal", "summary": summary + "."}

    if savings_rate < TIGHT_SAVINGS_RATE:
        return {
            "level": "attention",
            "title": "Margem apertada",
            "summary": f"Sobrou só {brl(balance)} ({pct(savings_rate)} da receita) — pouca folga para imprevistos.",
        }

    return {
        "level": "good",
        "title": "Mês equilibrado",
        "summary": f"Saldo positivo de {brl(balance)} ({pct(savings_rate)} da receita), dentro do seu padrão.",
    }


def _insights(ctx):
    """Lista de frases explicando o mês. tone: negative | positive | neutral."""
    insights = []
    income, expense = ctx["income"], ctx["expense"]
    n = ctx["baseline_count"]

    def add(tone, text):
        insights.append({"tone": tone, "text": text})

    if income == ZERO and expense == ZERO:
        return insights

    if not n:
        add("neutral", "Ainda não há meses anteriores com movimentação para comparar — o diagnóstico fica mais preciso com histórico.")
    else:
        period = baseline_phrase_of(n)

        expense_change = ratio(expense - ctx["avg_expense"], ctx["avg_expense"])
        if expense_change is not None and abs(expense_change) >= NOTABLE_CHANGE:
            direction = "acima" if expense_change > 0 else "abaixo"
            add(
                "negative" if expense_change > 0 else "positive",
                f"Despesas {pct(expense_change)} {direction} {period} ({brl(expense)} contra {brl(ctx['avg_expense'])}).",
            )

        income_change = ratio(income - ctx["avg_income"], ctx["avg_income"])
        if income_change is not None and abs(income_change) >= NOTABLE_CHANGE:
            direction = "acima" if income_change > 0 else "abaixo"
            add(
                "positive" if income_change > 0 else "negative",
                f"Receitas {pct(income_change)} {direction} {period} ({brl(income)} contra {brl(ctx['avg_income'])}).",
            )

        for d in ctx["expense_up"][:3]:
            if d["is_new"]:
                add("negative", f"“{d['name']}” é um gasto novo: {brl(d['current'])} sem registro nos meses anteriores.")
            else:
                add(
                    "negative",
                    f"“{d['name']}” pesou {brl(d['delta'])} a mais que o normal ({brl(d['current'])} contra média de {brl(d['average'])}).",
                )

        for d in ctx["expense_down"][:2]:
            if d["current"] == ZERO:
                add("positive", f"Sem gastos com “{d['name']}” neste mês (média de {brl(d['average'])}).")
            else:
                add("positive", f"“{d['name']}” ficou {brl(-d['delta'])} abaixo da média, aliviando o mês.")

        for d in ctx["income_changes"][:2]:
            if d["delta"] > ZERO:
                if d["is_new"]:
                    add("positive", f"Entrada extra em “{d['name']}”: {brl(d['current'])}.")
                else:
                    add("positive", f"“{d['name']}” rendeu {brl(d['delta'])} a mais que o normal.")
            elif d["current"] == ZERO:
                add("negative", f"Não entrou nada em “{d['name']}” neste mês (média de {brl(d['average'])}).")
            else:
                add("negative", f"“{d['name']}” rendeu {brl(-d['delta'])} a menos que o normal.")

    for t in ctx["top_expenses"]:
        if t["kind"] == "one_off" and t["share"] is not None and t["share"] >= ONE_OFF_SHARE:
            add(
                "negative",
                f"Um gasto pontual concentrou {pct(t['share'])} das despesas: “{t['description']}” "
                f"({brl(t['amount'])} em {t['date'].strftime('%d/%m')}).",
            )
            break

    installment_share = ratio(ctx["composition"]["installment"], expense)
    if installment_share is not None and installment_share >= INSTALLMENT_SHARE:
        add(
            "negative",
            f"Parcelamentos comprometem {pct(installment_share)} das despesas ({brl(ctx['composition']['installment'])}).",
        )

    recurring_share = ratio(ctx["composition"]["recurring"], income)
    if recurring_share is not None and recurring_share >= RECURRING_INCOME_SHARE:
        add(
            "negative",
            f"Gastos fixos e recorrentes já consomem {pct(recurring_share)} da receita — pouca margem para variações.",
        )

    if ctx["pending_expense"] > ZERO:
        add("neutral", f"Ainda há {brl(ctx['pending_expense'])} em despesas não baixadas (a pagar) neste mês.")

    return insights
