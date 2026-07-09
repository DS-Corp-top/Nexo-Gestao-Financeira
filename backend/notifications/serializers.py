from rest_framework import serializers

from notifications.models import PushSubscription


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ("id", "endpoint", "p256dh", "auth", "user_agent", "created_at")
        read_only_fields = ("id", "created_at")
