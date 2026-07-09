from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import get_user_tenant
from notifications.models import PushSubscription
from notifications.serializers import PushSubscriptionSerializer


class VapidPublicKeyView(APIView):
    def get(self, request):
        return Response({"public_key": settings.VAPID_PUBLIC_KEY})


class PushSubscribeView(APIView):
    def post(self, request):
        endpoint = (request.data.get("endpoint") or "").strip()
        keys = request.data.get("keys") or {}
        p256dh = (keys.get("p256dh") or "").strip()
        auth = (keys.get("auth") or "").strip()
        user_agent = (request.data.get("user_agent") or "")[:255]

        if not endpoint or not p256dh or not auth:
            return Response(
                {"detail": "endpoint, keys.p256dh e keys.auth são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = get_user_tenant(request.user, request)
        subscription, _ = PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": request.user,
                "tenant": tenant,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": user_agent,
            },
        )
        return Response(PushSubscriptionSerializer(subscription).data, status=status.HTTP_200_OK)


class PushUnsubscribeView(APIView):
    def post(self, request):
        endpoint = (request.data.get("endpoint") or "").strip()
        if not endpoint:
            return Response({"detail": "endpoint é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        # Scoped to the requesting user so one browser can't drop another
        # user's subscription just by knowing its endpoint URL.
        PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
