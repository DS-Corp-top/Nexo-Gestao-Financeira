from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseServerError
from django.views import View

from nexo.react_build import find_react_index, react_build_missing_message


class ReactAppView(View):
    def get(self, request, path=""):
        if path and Path(path).suffix:
            raise Http404

        index_path = find_react_index(settings)
        if index_path is None:
            return HttpResponseServerError(react_build_missing_message(settings))

        return FileResponse(index_path.open("rb"), content_type="text/html")
