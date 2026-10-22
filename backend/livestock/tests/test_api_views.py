import json
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from livestock.models import CattleLot, CattleLotEntry
from tenants.models import Tenant, TenantMembership


class CattleLotApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="cattle-user", password="secret123")
        self.other_user = user_model.objects.create_user(username="cattle-other", password="secret123")
        self.tenant = Tenant.objects.create(
            name="Fazenda A", slug="fazenda-a", owner=self.user, document="12345678901",
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.user, role=TenantMembership.Role.OWNER, is_default=True,
        )
        self.other_tenant = Tenant.objects.create(
            name="Fazenda B", slug="fazenda-b", owner=self.other_user, document="12345678902",
        )
        TenantMembership.objects.create(
            tenant=self.other_tenant, user=self.other_user, role=TenantMembership.Role.OWNER, is_default=True,
        )
        self.lot = CattleLot.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Lote 01",
            system=CattleLot.System.FEEDLOT,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),  # 100 dias
        )
        self.other_lot = CattleLot.objects.create(
            user=self.other_user, tenant=self.other_tenant, name="Lote Alheio",
        )
        self.client = APIClient()
        self.client.defaults["HTTP_X_REQUESTED_WITH"] = "XMLHttpRequest"
        self.client.force_authenticate(self.user)

    def _entry(self, entry_type, amount, head_count=None, weight_kg=None, lot=None):
        return CattleLotEntry.objects.create(
            user=self.user,
            tenant=self.tenant,
            lot=lot or self.lot,
            entry_type=entry_type,
            amount=Decimal(amount),
            head_count=head_count,
            weight_kg=Decimal(weight_kg) if weight_kg else None,
        )

    def test_create_lot_assigns_user_and_tenant(self):
        response = self.client.post(
            "/api/v1/cattle-lots/",
            {"name": "Lote Semi", "system": "semi_feedlot", "start_date": "2026-05-01"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        lot = CattleLot.objects.get(name="Lote Semi")
        self.assertEqual(lot.user, self.user)
        self.assertEqual(lot.tenant, self.tenant)
        self.assertEqual(lot.system, CattleLot.System.SEMI_FEEDLOT)

    def test_end_date_before_start_date_is_rejected(self):
        response = self.client.post(
            "/api/v1/cattle-lots/",
            {"name": "Lote X", "start_date": "2026-05-10", "end_date": "2026-05-01"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.json())

    def test_list_only_returns_lots_from_current_tenant(self):
        response = self.client.get("/api/v1/cattle-lots/")

        self.assertEqual(response.status_code, 200)
        names = [lot["name"] for lot in response.json()["results"]]
        self.assertEqual(names, ["Lote 01"])

    def test_cannot_access_lot_from_another_tenant(self):
        response = self.client.get(f"/api/v1/cattle-lots/{self.other_lot.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_lot_metrics_cover_costs_sale_and_margin(self):
        self._entry("acquisition", "200000.00", head_count=100, weight_kg="36000")
        self._entry("feed", "50000.00")
        self._entry("medicine", "3000.00")
        self._entry("vaccine", "2000.00")
        self._entry("freight", "4000.00")
        self._entry("other_cost", "1000.00")
        self._entry("sale", "300000.00", head_count=100, weight_kg="52000")

        response = self.client.get(f"/api/v1/cattle-lots/{self.lot.pk}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["acquisition_cost"], "200000.00")
        self.assertEqual(data["feed_cost"], "50000.00")
        self.assertEqual(data["medicine_cost"], "3000.00")
        self.assertEqual(data["vaccine_cost"], "2000.00")
        self.assertEqual(data["freight_cost"], "4000.00")
        self.assertEqual(data["other_costs"], "1000.00")
        self.assertEqual(data["total_cost"], "260000.00")
        self.assertEqual(data["sales_revenue"], "300000.00")
        self.assertEqual(data["profit"], "40000.00")
        self.assertEqual(data["margin_percent"], "13.33")
        self.assertEqual(data["cost_per_head"], "2600.00")
        self.assertEqual(data["days_on_feed"], 100)
        self.assertEqual(data["feed_cost_per_head_day"], "5.00")
        self.assertEqual(data["heads_purchased"], 100)
        self.assertEqual(data["heads_sold"], 100)
        self.assertEqual(data["heads_on_hand"], 0)
        self.assertEqual(data["avg_purchase_weight_kg"], "360.00")
        self.assertEqual(data["avg_sale_weight_kg"], "520.00")
        self.assertEqual(len(data["entries"]), 7)

    def test_lot_without_sales_has_no_margin(self):
        self._entry("acquisition", "1000.00", head_count=1)

        data = self.client.get(f"/api/v1/cattle-lots/{self.lot.pk}/").json()

        self.assertIsNone(data["margin_percent"])
        self.assertEqual(data["profit"], "-1000.00")
        self.assertEqual(data["heads_on_hand"], 1)

    def test_open_lot_counts_days_until_today(self):
        lot = CattleLot.objects.create(
            user=self.user, tenant=self.tenant, name="Aberto",
            start_date=timezone.localdate() - timedelta(days=30),
        )
        data = self.client.get(f"/api/v1/cattle-lots/{lot.pk}/").json()
        self.assertEqual(data["days_on_feed"], 30)

    def test_list_query_count_does_not_grow_with_lots(self):
        def count_list_queries():
            with CaptureQueriesContext(connection) as ctx:
                self.client.get("/api/v1/cattle-lots/")
            return len(ctx.captured_queries)

        self._entry("acquisition", "100.00", head_count=1)
        baseline = count_list_queries()
        for index in range(3):
            lot = CattleLot.objects.create(user=self.user, tenant=self.tenant, name=f"Lote extra {index}")
            self._entry("acquisition", "100.00", head_count=1, lot=lot)
            self._entry("feed", "10.00", lot=lot)

        self.assertEqual(count_list_queries(), baseline)

    def test_create_entry_via_api(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {
                "lot": self.lot.pk,
                "entry_type": "acquisition",
                "date": "2026-01-01",
                "amount": "150000.00",
                "head_count": 50,
                "weight_kg": "18000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        entry = CattleLotEntry.objects.get(pk=response.json()["id"])
        self.assertEqual(entry.tenant, self.tenant)
        self.assertEqual(entry.user, self.user)

    def test_acquisition_requires_head_count(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {"lot": self.lot.pk, "entry_type": "acquisition", "date": "2026-01-01", "amount": "1000.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("head_count", response.json())

    def test_sale_cannot_exceed_heads_on_hand(self):
        self._entry("acquisition", "10000.00", head_count=10)
        self._entry("sale", "8000.00", head_count=6)

        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {"lot": self.lot.pk, "entry_type": "sale", "date": "2026-03-01", "amount": "6000.00", "head_count": 5},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("head_count", response.json())

    def test_editing_a_sale_does_not_count_itself_against_stock(self):
        self._entry("acquisition", "10000.00", head_count=10)
        sale = self._entry("sale", "8000.00", head_count=10)

        response = self.client.patch(
            f"/api/v1/cattle-lot-entries/{sale.pk}/", {"amount": "9000.00"}, format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_cannot_delete_acquisition_already_sold(self):
        acquisition = self._entry("acquisition", "10000.00", head_count=10)
        self._entry("sale", "8000.00", head_count=4)

        response = self.client.delete(f"/api/v1/cattle-lot-entries/{acquisition.pk}/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("já foram vendidas", response.json()["detail"])
        self.assertTrue(CattleLotEntry.objects.filter(pk=acquisition.pk).exists())

    def test_can_delete_acquisition_when_other_purchases_cover_sales(self):
        first = self._entry("acquisition", "10000.00", head_count=10)
        self._entry("acquisition", "5000.00", head_count=5)
        self._entry("sale", "4000.00", head_count=5)

        response = self.client.delete(f"/api/v1/cattle-lot-entries/{first.pk}/")

        self.assertEqual(response.status_code, 204)

    def test_can_delete_sale_and_feed_entries(self):
        self._entry("acquisition", "10000.00", head_count=10)
        sale = self._entry("sale", "8000.00", head_count=10)
        feed = self._entry("feed", "100.00")

        self.assertEqual(self.client.delete(f"/api/v1/cattle-lot-entries/{sale.pk}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/v1/cattle-lot-entries/{feed.pk}/").status_code, 204)

    def test_reducing_acquisition_below_sold_heads_is_rejected(self):
        acquisition = self._entry("acquisition", "10000.00", head_count=10)
        self._entry("sale", "8000.00", head_count=8)

        response = self.client.patch(
            f"/api/v1/cattle-lot-entries/{acquisition.pk}/", {"head_count": 5}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("estoque negativo", response.json()["head_count"][0])

    def test_changing_acquisition_type_to_feed_when_sold_is_rejected(self):
        acquisition = self._entry("acquisition", "10000.00", head_count=10)
        self._entry("sale", "8000.00", head_count=8)

        response = self.client.patch(
            f"/api/v1/cattle-lot-entries/{acquisition.pk}/", {"entry_type": "feed"}, format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_feed_entry_drops_head_count_and_weight(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {
                "lot": self.lot.pk, "entry_type": "feed", "date": "2026-01-10",
                "amount": "500.00", "head_count": 10, "weight_kg": "100",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["head_count"])
        self.assertIsNone(response.json()["weight_kg"])

    def test_amount_must_be_positive(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {"lot": self.lot.pk, "entry_type": "feed", "date": "2026-01-10", "amount": "0"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.json())

    def test_cannot_create_entry_on_another_tenant_lot(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {"lot": self.other_lot.pk, "entry_type": "feed", "date": "2026-01-10", "amount": "100.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("lot", response.json())
        self.assertFalse(CattleLotEntry.objects.filter(lot=self.other_lot).exists())

    def test_entries_list_is_tenant_scoped(self):
        self._entry("feed", "100.00")
        CattleLotEntry.objects.create(
            user=self.other_user, tenant=self.other_tenant, lot=self.other_lot,
            entry_type="feed", amount=Decimal("999.00"),
        )

        response = self.client.get("/api/v1/cattle-lot-entries/")

        amounts = [entry["amount"] for entry in response.json()["results"]]
        self.assertEqual(amounts, ["100.00"])

    def test_update_lot_closes_it(self):
        response = self.client.patch(
            f"/api/v1/cattle-lots/{self.lot.pk}/",
            {"name": "Lote 01 - vendido", "status": "closed", "end_date": "2026-04-20"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.name, "Lote 01 - vendido")
        self.assertEqual(self.lot.status, CattleLot.Status.CLOSED)
        self.assertEqual(response.json()["days_on_feed"], 109)

    def test_update_lot_with_end_before_start_is_rejected(self):
        response = self.client.patch(
            f"/api/v1/cattle-lots/{self.lot.pk}/", {"end_date": "2025-12-31"}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.json())

    def test_cannot_update_lot_from_another_tenant(self):
        response = self.client.patch(
            f"/api/v1/cattle-lots/{self.other_lot.pk}/", {"name": "Invadido"}, format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.other_lot.refresh_from_db()
        self.assertEqual(self.other_lot.name, "Lote Alheio")

    def test_list_filters_by_status_system_and_search(self):
        CattleLot.objects.create(
            user=self.user, tenant=self.tenant, name="Semi Piquete", system=CattleLot.System.SEMI_FEEDLOT,
            status=CattleLot.Status.CLOSED, location="Piquete Norte",
            start_date=date(2025, 6, 1), end_date=date(2025, 9, 1),
        )

        def names(query):
            return [lot["name"] for lot in self.client.get(f"/api/v1/cattle-lots/?{query}").json()["results"]]

        self.assertEqual(names("status=closed"), ["Semi Piquete"])
        self.assertEqual(names("system=feedlot"), ["Lote 01"])
        self.assertEqual(names("search=Norte"), ["Semi Piquete"])

    def test_list_omits_entries_but_detail_includes_them(self):
        self._entry("feed", "100.00")

        listed = self.client.get("/api/v1/cattle-lots/").json()["results"][0]
        detail = self.client.get(f"/api/v1/cattle-lots/{self.lot.pk}/").json()

        self.assertNotIn("entries", listed)
        self.assertEqual(listed["feed_cost"], "100.00")
        self.assertEqual(len(detail["entries"]), 1)

    def test_entries_filter_by_lot_and_type(self):
        other = CattleLot.objects.create(user=self.user, tenant=self.tenant, name="Lote 02")
        self._entry("feed", "100.00")
        self._entry("vaccine", "50.00")
        self._entry("feed", "70.00", lot=other)

        by_lot = self.client.get(f"/api/v1/cattle-lot-entries/?lot={self.lot.pk}").json()["results"]
        by_type = self.client.get("/api/v1/cattle-lot-entries/?entry_type=vaccine").json()["results"]

        self.assertEqual(sorted(e["amount"] for e in by_lot), ["100.00", "50.00"])
        self.assertEqual([e["amount"] for e in by_type], ["50.00"])

    def test_weight_must_be_positive(self):
        response = self.client.post(
            "/api/v1/cattle-lot-entries/",
            {"lot": self.lot.pk, "entry_type": "acquisition", "date": "2026-01-01",
             "amount": "1000.00", "head_count": 1, "weight_kg": "0"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("weight_kg", response.json())

    def test_cannot_move_entry_to_another_tenant_lot(self):
        entry = self._entry("feed", "100.00")

        response = self.client.patch(
            f"/api/v1/cattle-lot-entries/{entry.pk}/", {"lot": self.other_lot.pk}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        entry.refresh_from_db()
        self.assertEqual(entry.lot_id, self.lot.pk)

    def test_editing_sale_above_stock_is_rejected(self):
        self._entry("acquisition", "10000.00", head_count=10)
        sale = self._entry("sale", "4000.00", head_count=4)

        response = self.client.patch(
            f"/api/v1/cattle-lot-entries/{sale.pk}/", {"head_count": 11}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("excede o estoque do lote (10)", response.json()["head_count"][0])

    def test_entries_from_another_tenant_cannot_be_deleted(self):
        foreign = CattleLotEntry.objects.create(
            user=self.other_user, tenant=self.other_tenant, lot=self.other_lot,
            entry_type="feed", amount=Decimal("10.00"),
        )

        response = self.client.delete(f"/api/v1/cattle-lot-entries/{foreign.pk}/")

        self.assertEqual(response.status_code, 404)
        self.assertTrue(CattleLotEntry.objects.filter(pk=foreign.pk).exists())

    def test_requires_authentication(self):
        anonymous = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")

        self.assertEqual(anonymous.get("/api/v1/cattle-lots/").status_code, 401)
        self.assertEqual(anonymous.get("/api/v1/cattle-lot-entries/").status_code, 401)

    def test_deleting_lot_removes_its_entries(self):
        self._entry("feed", "100.00")

        response = self.client.delete(f"/api/v1/cattle-lots/{self.lot.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(CattleLotEntry.objects.filter(lot_id=self.lot.pk).exists())


class CattleLotMaskingTests(TestCase):
    def test_view_only_superuser_gets_no_lot_content(self):
        user_model = get_user_model()
        owner = user_model.objects.create_user(username="cattle-owner", password="x")
        tenant = Tenant.objects.create(name="Fazenda C", slug="fazenda-c", owner=owner, document="12345678903")
        TenantMembership.objects.create(tenant=tenant, user=owner, role=TenantMembership.Role.OWNER, is_default=True)
        lot = CattleLot.objects.create(user=owner, tenant=tenant, name="Lote Secreto")
        superuser = user_model.objects.create_superuser(username="root-cattle", password="x", email="r@x.com")

        client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        client.force_authenticate(superuser)
        listing = client.get("/api/v1/cattle-lots/", HTTP_X_TENANT_ID=str(tenant.id))
        detail = client.get(f"/api/v1/cattle-lots/{lot.pk}/", HTTP_X_TENANT_ID=str(tenant.id))

        self.assertEqual(json.loads(listing.content)["results"], [])
        self.assertEqual(detail.status_code, 403)

        entry = CattleLotEntry.objects.create(
            user=owner, tenant=tenant, lot=lot, entry_type="feed", amount=Decimal("10.00"),
        )
        entries = client.get("/api/v1/cattle-lot-entries/", HTTP_X_TENANT_ID=str(tenant.id))
        entry_detail = client.get(f"/api/v1/cattle-lot-entries/{entry.pk}/", HTTP_X_TENANT_ID=str(tenant.id))
        self.assertEqual(json.loads(entries.content)["results"], [])
        self.assertEqual(entry_detail.status_code, 403)

    def test_masking_middleware_hides_every_cattle_money_field(self):
        # Segunda camada: se algum payload de lote escapar, o middleware zera os valores.
        from core.middleware import FinancialMaskingMiddleware
        from livestock.serializers import CattleLotSerializer

        owner = get_user_model().objects.create_user(username="cattle-mask", password="x")
        tenant = Tenant.objects.create(name="Fazenda M", slug="fazenda-m", owner=owner, document="12345678904")
        lot = CattleLot.objects.create(user=owner, tenant=tenant, name="Lote Mascarado")
        for entry_type, amount in (("acquisition", "500.00"), ("sale", "900.00")):
            CattleLotEntry.objects.create(
                user=owner, tenant=tenant, lot=lot, entry_type=entry_type, amount=Decimal(amount), head_count=1,
            )
        payload = CattleLotSerializer(CattleLot.objects.prefetch_related("entries").get(pk=lot.pk)).data

        FinancialMaskingMiddleware._mask(payload)

        money_fields = (
            "acquisition_cost", "feed_cost", "medicine_cost", "vaccine_cost", "freight_cost", "other_costs",
            "total_cost", "sales_revenue", "profit", "margin_percent", "cost_per_head",
        )
        for field in money_fields:
            self.assertIsNone(payload[field], field)
        self.assertTrue(all(entry["amount"] is None for entry in payload["entries"]))
        self.assertEqual(payload["heads_purchased"], 1)  # contagem de animais não é valor monetário
