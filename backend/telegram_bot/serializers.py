from rest_framework import serializers

from .models import TelegramLink


class TelegramLinkSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="default_account.name", read_only=True, default=None)

    class Meta:
        model = TelegramLink
        fields = ["id", "chat_id", "account_name", "linked_at"]
        read_only_fields = fields
