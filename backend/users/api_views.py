from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import get_user_tenant
from tenants.models import TenantMembership
from users.serializers import RegisterSerializer, UserSerializer


class MeView(APIView):
    """Return the authenticated user's profile and active tenant info."""

    def get(self, request):
        user_data = UserSerializer(request.user).data
        tenant = get_user_tenant(request.user)
        tenant_data = {
            "id": tenant.pk,
            "name": tenant.name,
            "slug": tenant.slug,
        } if tenant else None

        return Response({
            "user": user_data,
            "tenant": tenant_data,
        })


class RegisterAPIView(generics.CreateAPIView):
    """Public registration endpoint (mirrors users.views.RegisterView)."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        if not getattr(settings, "PUBLIC_SIGNUP_ENABLED", False):
            return Response(
                {"detail": "Cadastro público desabilitado no momento."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Cadastro enviado. Aguarde a validação do administrador."},
            status=status.HTTP_201_CREATED,
        )
