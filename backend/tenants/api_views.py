from rest_framework import generics, parsers, viewsets

from common.api_mixins import get_user_tenant
from tenants.models import Tenant, TenantMembership, NfseCredential
from tenants.serializers import TenantSerializer, TenantMembershipSerializer, NfseCredentialSerializer


class TenantProfileView(generics.RetrieveUpdateAPIView):
    """Retrieve and update the authenticated user's tenant profile.

    Supports multipart/form-data for logo uploads.
    """

    serializer_class = TenantSerializer
    parser_classes = [parsers.MultiPartParser, parsers.JSONParser]

    def get_object(self):
        return get_user_tenant(self.request.user)

class TenantMembershipViewSet(generics.ListCreateAPIView, viewsets.GenericViewSet):
    """ViewSet to list and create tenant memberships."""
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        return TenantMembership.objects.filter(tenant=get_user_tenant(self.request.user))

    def perform_create(self, serializer):
        serializer.save(tenant=get_user_tenant(self.request.user))

class NfseCredentialViewSet(viewsets.ModelViewSet):
    serializer_class = NfseCredentialSerializer

    def get_queryset(self):
        return NfseCredential.objects.filter(tenant=get_user_tenant(self.request.user))

    def perform_create(self, serializer):
        serializer.save(tenant=get_user_tenant(self.request.user))
