from django.urls import path

from shopping.views import (
    ShoppingItemCreateView,
    ShoppingItemDeleteView,
    ShoppingItemTogglePurchasedView,
    ShoppingItemUpdateView,
    ShoppingListCreateView,
    ShoppingListDeleteView,
    ShoppingListDetailView,
    ShoppingListUpdateView,
    ShoppingListView,
)

app_name = "shopping"

urlpatterns = [
    path("", ShoppingListView.as_view(), name="list"),
    path("new/", ShoppingListCreateView.as_view(), name="create"),
    path("<int:pk>/", ShoppingListDetailView.as_view(), name="detail"),
    path("<int:pk>/edit/", ShoppingListUpdateView.as_view(), name="update"),
    path("<int:pk>/delete/", ShoppingListDeleteView.as_view(), name="delete"),
    path("items/new/", ShoppingItemCreateView.as_view(), name="item-create"),
    path("items/<int:pk>/edit/", ShoppingItemUpdateView.as_view(), name="item-update"),
    path("items/<int:pk>/delete/", ShoppingItemDeleteView.as_view(), name="item-delete"),
    path(
        "items/<int:pk>/toggle-purchased/",
        ShoppingItemTogglePurchasedView.as_view(),
        name="toggle-purchased",
    ),
]
