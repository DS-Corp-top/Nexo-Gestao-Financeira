from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView, TemplateView

from nexo.views import ManifestView, ServiceWorkerView

urlpatterns = [
    path('admin/', admin.site.urls),
    path("manifest.json", ManifestView.as_view(), name="manifest"),
    path("service-worker.js", ServiceWorkerView.as_view(), name="service-worker"),
    path("favicon.ico", RedirectView.as_view(url=f"{settings.STATIC_URL}icons/favicon.png", permanent=False), name="favicon"),
    re_path(r'^app/.*$', TemplateView.as_view(template_name="react/index.html"), name='react_app'),
    path("users/", include("users.urls")),
    path("accounts/", include("accounts.urls")),
    path("categories/", include("categories.urls")),
    path("transactions/", include("transactions.urls")),
    path("shopping/", include("shopping.urls")),
    path("investimentos/", include("investments.urls")),
    path("faturas/", include("invoices.urls")),
    path("empresa/", include("tenants.urls")),
    path("api/v1/", include("nexo.api_urls")),
    path("", include("dashboard.urls")),
]

if settings.RUNSERVER:
    from django.conf.urls.static import static
    urlpatterns += [path("__reload__/", include("django_browser_reload.urls"))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
