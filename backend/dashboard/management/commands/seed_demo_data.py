import os
from datetime import date

from dateutil.relativedelta import relativedelta
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.models import Account
from categories.models import Category
from tenants.models import Tenant
from transactions.models import Transaction

User = get_user_model()


class Command(BaseCommand):
    """Popula um tenant existente com contas, categorias e transações fictícias.

    Uso local apenas: recusa rodar em um dyno Heroku (produção), assim como o
    seed_e2e. Idempotente na criação de contas/categorias (get_or_create);
    as transações são recriadas a cada execução (apagadas e recriadas) para
    não duplicar valores no resumo.
    """

    help = "Cria contas, categorias e transações fictícias para um usuário existente."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="souzadaniel187@gmail.com")

    def handle(self, *args, **options):
        if os.getenv("DYNO"):
            raise CommandError("seed_demo_data não pode rodar em um dyno Heroku (produção).")

        email = options["email"]
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f"Usuário com e-mail {email} não encontrado.")

        tenant = Tenant.objects.filter(memberships__user=user).first()
        if not tenant:
            raise CommandError(f"Usuário {email} não pertence a nenhum tenant.")

        checking, _ = Account.objects.get_or_create(
            tenant=tenant,
            name="Conta Corrente",
            defaults={
                "user": user,
                "account_type": Account.AccountType.BANK,
                "initial_balance": "2500.00",
                "include_in_balance": True,
                "is_active": True,
            },
        )
        wallet, _ = Account.objects.get_or_create(
            tenant=tenant,
            name="Carteira",
            defaults={
                "user": user,
                "account_type": Account.AccountType.CASH,
                "initial_balance": "150.00",
                "include_in_balance": True,
                "is_active": True,
            },
        )
        card, _ = Account.objects.get_or_create(
            tenant=tenant,
            name="Cartão de Crédito",
            defaults={
                "user": user,
                "account_type": Account.AccountType.CARD,
                "credit_limit": "3000.00",
                "include_in_balance": False,
                "is_active": True,
            },
        )

        income_categories = {}
        for name in ["Salário", "Freelance"]:
            income_categories[name], _ = Category.objects.get_or_create(
                tenant=tenant,
                name=name,
                category_type=Category.CategoryType.INCOME,
                defaults={"user": user},
            )

        expense_categories = {}
        for name in ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde"]:
            expense_categories[name], _ = Category.objects.get_or_create(
                tenant=tenant,
                name=name,
                category_type=Category.CategoryType.EXPENSE,
                defaults={"user": user},
            )

        today = date.today()
        this_month_start = today.replace(day=1)
        last_month_start = this_month_start - relativedelta(months=1)

        Transaction.objects.filter(
            tenant=tenant,
            date__gte=last_month_start,
            date__lte=today,
            description__startswith="[Demo]",
        ).delete()

        def add(description, amount, transaction_type, account, category, day, is_cleared, month_start=this_month_start):
            Transaction.objects.create(
                tenant=tenant,
                user=user,
                account=account,
                category=category,
                transaction_type=transaction_type,
                amount=amount,
                date=month_start.replace(day=day),
                description=f"[Demo] {description}",
                is_cleared=is_cleared,
            )

        # Mês passado, já liquidado, define o saldo atual.
        add("Salário", "5200.00", Transaction.TransactionType.INCOME, checking, income_categories["Salário"], 5, True, last_month_start)
        add("Aluguel", "1200.00", Transaction.TransactionType.EXPENSE, checking, expense_categories["Moradia"], 10, True, last_month_start)
        add("Mercado", "620.00", Transaction.TransactionType.EXPENSE, checking, expense_categories["Alimentação"], 12, True, last_month_start)

        # Mês atual.
        add("Salário", "5200.00", Transaction.TransactionType.INCOME, checking, income_categories["Salário"], 5, True)
        add("Freelance", "800.00", Transaction.TransactionType.INCOME, checking, income_categories["Freelance"], 15, False)
        add("Aluguel", "1200.00", Transaction.TransactionType.EXPENSE, checking, expense_categories["Moradia"], 10, True)
        add("Mercado", "540.00", Transaction.TransactionType.EXPENSE, checking, expense_categories["Alimentação"], 8, True)
        add("Uber", "45.00", Transaction.TransactionType.EXPENSE, wallet, expense_categories["Transporte"], 14, True)
        add("Internet", "120.00", Transaction.TransactionType.EXPENSE, checking, expense_categories["Moradia"], 20, False)
        add("Academia", "89.90", Transaction.TransactionType.EXPENSE, checking, expense_categories["Saúde"], 22, False)
        add("Cinema", "60.00", Transaction.TransactionType.EXPENSE, card, expense_categories["Lazer"], 6, True)
        add("Farmácia", "95.50", Transaction.TransactionType.EXPENSE, card, expense_categories["Saúde"], 11, True)
        add("Restaurante", "210.00", Transaction.TransactionType.EXPENSE, card, expense_categories["Alimentação"], 18, False)

        self.stdout.write(self.style.SUCCESS(
            f"Dados fictícios criados para {email} (tenant={tenant.name})."
        ))
