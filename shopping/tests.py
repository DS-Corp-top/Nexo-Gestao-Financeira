from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from shopping.models import ShoppingItem, ShoppingList


class ShoppingViewsTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="shopping-user",
            password="pass-12345",
        )
        self.other_user = user_model.objects.create_user(
            username="shopping-other",
            password="pass-12345",
        )

        self.shopping_list = ShoppingList.objects.create(
            user=self.user,
            name="Mercado",
            list_date=date(2026, 3, 23),
            notes="Compra do mes",
        )
        self.other_list = ShoppingList.objects.create(
            user=self.other_user,
            name="Farmacia",
            list_date=date(2026, 3, 24),
        )
        self.item = ShoppingItem.objects.create(
            user=self.user,
            shopping_list=self.shopping_list,
            title="Cafe",
            quantity=2,
            unit_price=Decimal("12.50"),
            is_purchased=False,
        )
        ShoppingItem.objects.create(
            user=self.other_user,
            shopping_list=self.other_list,
            title="Azeite",
            quantity=1,
            unit_price=Decimal("20.00"),
            is_purchased=False,
        )

    def test_list_requires_login(self):
        response = self.client.get(reverse("shopping:list"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/users/login/", response["Location"])

    def test_root_shows_only_current_user_lists(self):
        self.client.login(username="shopping-user", password="pass-12345")
        response = self.client.get(reverse("shopping:list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Mercado")
        self.assertContains(response, "23/03/2026")
        self.assertNotContains(response, "Farmacia")
        self.assertNotContains(response, "Cafe")

    def test_detail_shows_only_items_of_selected_list(self):
        outra_lista = ShoppingList.objects.create(
            user=self.user,
            name="Churrasco",
        )
        ShoppingItem.objects.create(
            user=self.user,
            shopping_list=outra_lista,
            title="Carvao",
            quantity=1,
            unit_price=Decimal("25.00"),
        )

        self.client.login(username="shopping-user", password="pass-12345")
        response = self.client.get(reverse("shopping:detail", args=[self.shopping_list.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Cafe")
        self.assertNotContains(response, "Carvao")

    def test_detail_summary_estimate_counts_only_purchased_items_of_selected_list(self):
        ShoppingItem.objects.create(
            user=self.user,
            shopping_list=self.shopping_list,
            title="Arroz",
            quantity=3,
            unit_price=Decimal("10.00"),
            is_purchased=True,
        )
        ShoppingItem.objects.create(
            user=self.user,
            shopping_list=self.shopping_list,
            title="Leite",
            quantity=2,
            unit_price=Decimal("5.00"),
            is_purchased=False,
        )
        outra_lista = ShoppingList.objects.create(user=self.user, name="Feira")
        ShoppingItem.objects.create(
            user=self.user,
            shopping_list=outra_lista,
            title="Banana",
            quantity=10,
            unit_price=Decimal("1.00"),
            is_purchased=True,
        )

        self.client.login(username="shopping-user", password="pass-12345")
        response = self.client.get(reverse("shopping:detail", args=[self.shopping_list.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["purchased_total"], Decimal("30.00"))

    def test_toggle_purchased_changes_status_and_redirects_to_list_detail(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.post(
            reverse("shopping:toggle-purchased", args=[self.item.pk]),
            data={"next": reverse("shopping:detail", args=[self.shopping_list.pk])},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("shopping:detail", args=[self.shopping_list.pk]))
        self.item.refresh_from_db()
        self.assertTrue(self.item.is_purchased)
        self.assertIsNotNone(self.item.purchased_at)

    def test_toggle_purchased_with_htmx_returns_redirect(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.post(
            reverse("shopping:toggle-purchased", args=[self.item.pk]),
            data={"next": reverse("shopping:detail", args=[self.shopping_list.pk])},
            HTTP_HX_REQUEST="true",
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            response.headers.get("HX-Redirect"),
            reverse("shopping:detail", args=[self.shopping_list.pk]),
        )

    def test_item_form_limits_lists_to_current_user(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.get(
            reverse("shopping:item-create"),
            {"list": self.shopping_list.pk},
        )

        self.assertEqual(response.status_code, 200)
        form = response.context["form"]
        self.assertIn(self.shopping_list, form.fields["shopping_list"].queryset)
        self.assertNotIn(self.other_list, form.fields["shopping_list"].queryset)

    def test_list_form_shows_date_field(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.get(reverse("shopping:create"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Data da lista")
        self.assertContains(response, 'type="date"', html=False)

    def test_create_list_assigns_logged_in_user(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.post(
            reverse("shopping:create"),
            {
                "name": "Feira",
                "list_date": "2026-04-02",
                "notes": "Hortifruti",
            },
        )

        self.assertRedirects(response, reverse("shopping:list"))
        shopping_list = ShoppingList.objects.get(name="Feira")
        self.assertEqual(shopping_list.user, self.user)
        self.assertIsNotNone(shopping_list.tenant)

    def test_create_item_assigns_logged_in_user(self):
        self.client.login(username="shopping-user", password="pass-12345")

        response = self.client.post(
            reverse("shopping:item-create"),
            {
                "shopping_list": str(self.shopping_list.pk),
                "title": "Leite",
                "quantity": "3",
                "unit_price": "4.50",
                "notes": "",
                "is_purchased": "",
            },
        )

        self.assertRedirects(response, reverse("shopping:detail", args=[self.shopping_list.pk]))
        item = ShoppingItem.objects.get(title="Leite")
        self.assertEqual(item.user, self.user)
        self.assertEqual(item.tenant, self.shopping_list.tenant)
