from django.test import TestCase

from invoices.forms import ClientForm, InvoiceForm


class ClientFormTest(TestCase):
    def test_client_form_valid(self):
        form = ClientForm(data={
            "name": "Test Client",
            "document": "12345678901234",
            "email": "test@example.com",
            "address": "Test Street, 123",
            "city": "Test City",
        })
        self.assertTrue(form.is_valid())

    def test_client_form_missing_name(self):
        form = ClientForm(data={
            "document": "12345678901234",
        })
        self.assertFalse(form.is_valid())
        self.assertIn("name", form.errors)


class InvoiceFormTest(TestCase):
    def test_invoice_form_valid(self):
        form = InvoiceForm(data={
            "issue_date": "2026-06-23",
            "due_date": "2026-07-23",
            "client_name": "Test Client",
            "client_document": "12345678901234",
            "client_email": "test@example.com",
            "service_code": "1.01",
            "service_description": "Software development",
            "gross_value": "1000.00",
            "deductions": "0.00",
            "iss_rate": "5.00",
            "pis_rate": "0.65",
            "cofins_rate": "3.00",
            "csll_rate": "1.00",
            "ir_rate": "1.50",
            "inss_rate": "0.00"
        })
        self.assertTrue(form.is_valid())

    def test_invoice_form_missing_required(self):
        form = InvoiceForm(data={
            "client_name": "Test Client",
        })
        self.assertFalse(form.is_valid())
        self.assertIn("issue_date", form.errors)
        self.assertIn("service_description", form.errors)
        self.assertIn("gross_value", form.errors)
