from django.views.generic import TemplateView


class ManifestView(TemplateView):
    template_name = "manifest.json"
    content_type = "application/manifest+json"

    def render_to_response(self, context, **response_kwargs):
        response = super().render_to_response(context, **response_kwargs)
        response["Cache-Control"] = "no-store"
        return response


class ServiceWorkerView(TemplateView):
    template_name = "service-worker.js"
    content_type = "application/javascript"

    def render_to_response(self, context, **response_kwargs):
        response = super().render_to_response(context, **response_kwargs)
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response["Service-Worker-Allowed"] = "/"
        return response
