from django.urls import reverse_lazy
from django.views.generic import CreateView, DeleteView, ListView, UpdateView

from categories.forms import CategoryForm
from categories.models import Category
from common.mixins import UserAssignMixin, UserQuerySetMixin


class CategoryListView(UserQuerySetMixin, ListView):
    model = Category
    template_name = "categories/category_list.html"
    context_object_name = "categories"


class CategoryCreateView(UserAssignMixin, CreateView):
    model = Category
    form_class = CategoryForm
    template_name = "categories/category_form.html"
    success_url = reverse_lazy("categories:list")


class CategoryUpdateView(UserQuerySetMixin, UpdateView):
    model = Category
    form_class = CategoryForm
    template_name = "categories/category_form.html"
    success_url = reverse_lazy("categories:list")


class CategoryDeleteView(UserQuerySetMixin, DeleteView):
    model = Category
    template_name = "categories/category_confirm_delete.html"
    success_url = reverse_lazy("categories:list")
