from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


UserModel = get_user_model()


class EmailOnlyBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = kwargs.get(UserModel.USERNAME_FIELD) or username or kwargs.get("email")
        if identifier is None or password is None:
            return None

        normalized_identifier = str(identifier).strip().lower()
        if "@" not in normalized_identifier:
            return None

        matches = list(
            UserModel._default_manager.filter(email__iexact=normalized_identifier)
        )
        if len(matches) != 1:
            return None

        user = matches[0]
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
