from django import forms

from categories.models import Category
from common.forms import style_form_fields


class CategoryForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = ("name", "category_type")
        labels = {
            "name": "Nome da categoria",
            "category_type": "Tipo",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form_fields(self)
