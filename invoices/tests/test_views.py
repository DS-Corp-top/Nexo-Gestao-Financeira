from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from invoices.models import Client, Invoice
from tenants.models import Tenant

User = get_user_model()


@override_settings(STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage")
class InvoicesViewsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="123")
        self.tenant = Tenant.objects.create(name="Test Tenant", owner=self.user)
        self.client.login(username="testuser", password="123")
        
    def test_invoice_list_view(self):
        response = self.client.get(reverse("invoices:list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/invoice_list.html")

    def test_invoice_create_view(self):
        response = self.client.get(reverse("invoices:create"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/invoice_form.html")

    def test_client_list_view(self):
        response = self.client.get(reverse("invoices:client-list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/client_list.html")

    def test_client_create_view(self):
        response = self.client.get(reverse("invoices:client-create"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/client_form.html")

    @patch("requests.get")
    def test_cnpj_lookup_api_format(self, mock_get):
        # Trigger an exception to test error handling
        mock_get.side_effect = Exception("API down")

        response = self.client.get(reverse("invoices:cnpj-lookup", args=["12345678901234"]))
        self.assertEqual(response.status_code, 502)
        data = response.json()
        self.assertIn("error", data)

@override_settings(STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage")
class UnauthenticatedViewsTest(TestCase):
    def test_redirect_if_not_logged_in(self):
        response = self.client.get(reverse("invoices:list"))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse("users:login")))
