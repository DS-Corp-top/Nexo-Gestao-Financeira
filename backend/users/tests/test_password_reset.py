import pytest
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from users.password_reset import CODE_CACHE_PREFIX, MAX_CODE_ATTEMPTS, TICKET_CACHE_PREFIX

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _request_code(client, email):
    return client.post(reverse("api:password_reset_request"), {"email": email})


def _get_code_from_cache(email):
    return cache.get(f"{CODE_CACHE_PREFIX}{email.lower()}")["code"]


def test_request_sends_code_for_registered_active_email(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    baker.make("auth.User", email="user@example.com", is_active=True)

    response = _request_code(client, "user@example.com")

    assert response.status_code == 200
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["user@example.com"]
    payload = cache.get(f"{CODE_CACHE_PREFIX}user@example.com")
    assert payload is not None
    assert len(payload["code"]) == 6


def test_request_is_generic_for_unregistered_email(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

    response = _request_code(client, "ghost@example.com")

    assert response.status_code == 200
    assert len(mail.outbox) == 0


def test_request_does_not_send_for_inactive_user(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    baker.make("auth.User", email="pending@example.com", is_active=False)

    _request_code(client, "pending@example.com")

    assert len(mail.outbox) == 0


def test_full_flow_request_confirm_complete(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)
    user.set_password("OldPass123")
    user.save()

    # Existing refresh token that should be blacklisted after reset.
    outstanding_refresh = RefreshToken.for_user(user)
    outstanding_token = OutstandingToken.objects.get(jti=outstanding_refresh["jti"])

    _request_code(client, user.email)
    code = _get_code_from_cache(user.email)

    confirm_response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": code}
    )
    assert confirm_response.status_code == 200
    reset_token = confirm_response.data["reset_token"]

    # Code is single-use — cache entry is gone after a successful confirm.
    assert cache.get(f"{CODE_CACHE_PREFIX}{user.email}") is None

    complete_response = client.post(
        reverse("api:password_reset_complete"),
        {
            "reset_token": reset_token,
            "new_password": "BrandNewPass456",
            "new_password_confirm": "BrandNewPass456",
        },
    )
    assert complete_response.status_code == 200

    user.refresh_from_db()
    assert user.check_password("BrandNewPass456")
    assert BlacklistedToken.objects.filter(token=outstanding_token).exists()


def test_confirm_with_wrong_code_increments_attempts_and_eventually_locks(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    _request_code(client, user.email)

    for _ in range(MAX_CODE_ATTEMPTS):
        response = client.post(
            reverse("api:password_reset_confirm"), {"email": user.email, "code": "000000"}
        )
        assert response.status_code == 400

    # Code is invalidated as soon as the attempt limit is hit — no window
    # where a still-cached code could be guessed correctly afterwards.
    assert cache.get(f"{CODE_CACHE_PREFIX}{user.email}") is None
    locked_response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": "111111"}
    )
    assert locked_response.status_code == 400


def test_complete_rejects_weak_password(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    _request_code(client, user.email)
    code = _get_code_from_cache(user.email)
    confirm_response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": code}
    )
    reset_token = confirm_response.data["reset_token"]

    response = client.post(
        reverse("api:password_reset_complete"),
        {"reset_token": reset_token, "new_password": "1234567", "new_password_confirm": "1234567"},
    )

    assert response.status_code == 400


def test_complete_rejects_unknown_reset_token(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

    response = client.post(
        reverse("api:password_reset_complete"),
        {
            "reset_token": "does-not-exist",
            "new_password": "BrandNewPass456",
            "new_password_confirm": "BrandNewPass456",
        },
    )

    assert response.status_code == 400


# --- Expiração ---------------------------------------------------------

def test_confirm_rejects_expired_code(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    # Simula um código já expirado sem depender de time.sleep: grava
    # diretamente no cache com timeout já vencido.
    cache.set(
        f"{CODE_CACHE_PREFIX}{user.email}",
        {"user_id": user.id, "code": "123456", "attempts": 0},
        timeout=-1,
    )

    response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": "123456"}
    )

    assert response.status_code == 400


def test_complete_rejects_expired_reset_token(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    cache.set(f"{TICKET_CACHE_PREFIX}expired-ticket", {"user_id": user.id}, timeout=-1)

    response = client.post(
        reverse("api:password_reset_complete"),
        {
            "reset_token": "expired-ticket",
            "new_password": "BrandNewPass456",
            "new_password_confirm": "BrandNewPass456",
        },
    )

    assert response.status_code == 400


# --- Reuso (replay) ------------------------------------------------------

def test_confirm_code_cannot_be_reused(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    _request_code(client, user.email)
    code = _get_code_from_cache(user.email)

    first = client.post(reverse("api:password_reset_confirm"), {"email": user.email, "code": code})
    assert first.status_code == 200

    second = client.post(reverse("api:password_reset_confirm"), {"email": user.email, "code": code})
    assert second.status_code == 400


def test_complete_reset_token_cannot_be_reused(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    _request_code(client, user.email)
    code = _get_code_from_cache(user.email)
    confirm_response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": code}
    )
    reset_token = confirm_response.data["reset_token"]

    payload = {
        "reset_token": reset_token,
        "new_password": "BrandNewPass456",
        "new_password_confirm": "BrandNewPass456",
    }
    first = client.post(reverse("api:password_reset_complete"), payload)
    assert first.status_code == 200

    second = client.post(
        reverse("api:password_reset_complete"),
        {**payload, "new_password": "AnotherPass789", "new_password_confirm": "AnotherPass789"},
    )
    assert second.status_code == 400


# --- Validação de input --------------------------------------------------

def test_request_rejects_invalid_email_format(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

    response = _request_code(client, "not-an-email")

    assert response.status_code == 400
    assert len(mail.outbox) == 0


def test_confirm_rejects_malformed_code(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)
    _request_code(client, user.email)

    response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": "12a45"}
    )

    assert response.status_code == 400


def test_complete_rejects_mismatched_password_confirmation(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="user@example.com", is_active=True)

    _request_code(client, user.email)
    code = _get_code_from_cache(user.email)
    confirm_response = client.post(
        reverse("api:password_reset_confirm"), {"email": user.email, "code": code}
    )
    reset_token = confirm_response.data["reset_token"]

    response = client.post(
        reverse("api:password_reset_complete"),
        {
            "reset_token": reset_token,
            "new_password": "BrandNewPass456",
            "new_password_confirm": "SomethingElse789",
        },
    )

    assert response.status_code == 400
    assert "new_password_confirm" in response.data


# --- E-mail duplicado entre usuários --------------------------------------

def test_request_skips_sending_when_email_shared_by_multiple_active_users(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    baker.make("auth.User", email="shared@example.com", is_active=True, username="user1")
    baker.make("auth.User", email="shared@example.com", is_active=True, username="user2")

    response = _request_code(client, "shared@example.com")

    assert response.status_code == 200
    assert len(mail.outbox) == 0
    assert cache.get(f"{CODE_CACHE_PREFIX}shared@example.com") is None


# --- Throttle --------------------------------------------------------------
# Uses the real configured rate (settings.py: "password_reset_request": "5/hour")
# rather than overriding it, since DRF's throttle rate cache doesn't reliably
# reload mid-test via override_settings.

def test_request_is_throttled_after_limit(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    baker.make("auth.User", email="user@example.com", is_active=True)

    for _ in range(5):
        response = _request_code(client, "user@example.com")
        assert response.status_code == 200

    throttled_response = _request_code(client, "user@example.com")
    assert throttled_response.status_code == 429


def test_confirm_is_throttled_after_limit(baker):
    # DRF throttling counts every request that reaches the view, regardless
    # of whether it succeeds or fails — so 20 wrong-code attempts (all 400)
    # still exhaust the "password_reset_confirm" budget before the 21st.
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

    for _ in range(20):
        response = client.post(
            reverse("api:password_reset_confirm"),
            {"email": "user@example.com", "code": "000000"},
        )
        assert response.status_code != 429

    throttled_response = client.post(
        reverse("api:password_reset_confirm"),
        {"email": "user@example.com", "code": "000000"},
    )
    assert throttled_response.status_code == 429


def test_complete_is_throttled_after_limit(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

    for _ in range(10):
        response = client.post(
            reverse("api:password_reset_complete"),
            {
                "reset_token": "does-not-exist",
                "new_password": "BrandNewPass456",
                "new_password_confirm": "BrandNewPass456",
            },
        )
        assert response.status_code != 429

    throttled_response = client.post(
        reverse("api:password_reset_complete"),
        {
            "reset_token": "does-not-exist",
            "new_password": "BrandNewPass456",
            "new_password_confirm": "BrandNewPass456",
        },
    )
    assert throttled_response.status_code == 429
