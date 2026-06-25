from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from categories.models import Category


class CategoryViewTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="category-user",
            email="category-user@example.com",
            password="secret123",
        )
        self.client.force_login(self.user)

    def test_create_category_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("categories:create"),
            {
                "name": "Mercado",
                "category_type": Category.CategoryType.EXPENSE,
            },
        )

        self.assertRedirects(response, reverse("categories:list"))
        category = Category.objects.get(name="Mercado")
        self.assertEqual(category.user, self.user)
        self.assertIsNotNone(category.tenant)
