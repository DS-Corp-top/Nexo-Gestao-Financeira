from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Read-only serializer for the authenticated user profile."""

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "is_superuser")
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for public user registration (mirrors RegisterForm logic)."""

    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password_confirm")

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": "As senhas não coincidem."}
            )
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            is_active=False,  # same as RegisterView — wait for admin approval
        )
        return user
