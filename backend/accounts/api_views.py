from rest_framework import viewsets

from accounts.models import Account, CardMonthlyLimit
from accounts.serializers import AccountSerializer, CardMonthlyLimitSerializer
from common.api_mixins import TenantQuerySetMixin


class AccountViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    search_fields = ("name",)
    filterset_fields = ("account_type", "is_active", "include_in_balance")
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())


class CardMonthlyLimitViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = CardMonthlyLimit.objects.all()
    serializer_class = CardMonthlyLimitSerializer
    filterset_fields = ("account", "year", "month")
    ordering = ("-year", "-month")

    def create(self, request, *args, **kwargs):
        from rest_framework.response import Response
        from rest_framework import status
        
        # Validation might fail due to unique_together if we just use standard validation,
        # but since we want update_or_create, we need to bypass the unique constraint error
        # or handle it differently. Actually, DRF ModelSerializer will run unique_together
        # validation during is_valid(). We should override validation or manually validate.
        # It's better to just extract data and do update_or_create.
        
        # Or better yet, we can use a custom serializer or just pull from request.data.
        # But wait! It's safer to use a custom update_or_create logic directly:
        account_id = request.data.get('account')
        year = request.data.get('year')
        month = request.data.get('month')
        amount = request.data.get('amount')
        
        if not all([account_id, year, month, amount]):
            return Response({"detail": "account, year, month, and amount are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        instance, created = CardMonthlyLimit.objects.update_or_create(
            account_id=account_id,
            year=year,
            month=month,
            defaults={"amount": amount, "tenant": self.get_tenant()}
        )
        
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
