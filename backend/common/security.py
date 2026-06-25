from django.utils.http import url_has_allowed_host_and_scheme


def resolve_safe_redirect_url(request, next_url, fallback_url, replacements=()):
    candidate = (next_url or "").strip()
    for old_prefix, new_prefix in replacements:
        if candidate.startswith(old_prefix):
            candidate = candidate.replace(old_prefix, new_prefix, 1)

    fallback = str(fallback_url)
    if not candidate:
        return fallback

    if url_has_allowed_host_and_scheme(
        url=candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate

    return fallback
