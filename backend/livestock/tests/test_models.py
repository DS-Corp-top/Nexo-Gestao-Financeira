from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from livestock.models import CattleLot, CattleLotEntry

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


def make_lot(owner, **kwargs):
    user, tenant = owner
    kwargs.setdefault("name", "Lote")
    return CattleLot.objects.create(user=user, tenant=tenant, **kwargs)


def add(lot, entry_type, amount, **kwargs):
    return CattleLotEntry.objects.create(
        user=lot.user, tenant=lot.tenant, lot=lot, entry_type=entry_type, amount=Decimal(amount), **kwargs,
    )


def fresh(lot):
    return CattleLot.objects.prefetch_related("entries").get(pk=lot.pk)


def test_str_representations(owner):
    lot = make_lot(owner, name="Lote Nelore")
    entry = add(lot, "vaccine", "150.00")

    assert str(lot) == "Lote Nelore"
    assert str(entry) == "Lote Nelore - Vacina R$ 150.00"


def test_lot_without_entries_has_neutral_metrics(owner):
    lot = fresh(make_lot(owner))

    assert lot.total_cost == Decimal("0.00")
    assert lot.profit == Decimal("0.00")
    assert lot.margin_percent is None
    assert lot.cost_per_head is None
    assert lot.feed_cost_per_head_day is None
    assert lot.avg_purchase_weight_kg is None
    assert lot.avg_sale_weight_kg is None
    assert lot.heads_on_hand == 0


def test_feed_cost_per_head_day_is_none_on_the_first_day(owner):
    lot = make_lot(owner, start_date=timezone.localdate())
    add(lot, "acquisition", "1000.00", head_count=10)
    add(lot, "feed", "100.00")

    lot = fresh(lot)

    assert lot.days_on_feed == 0
    assert lot.feed_cost_per_head_day is None
    assert lot.cost_per_head == Decimal("110.00")


def test_future_start_date_does_not_produce_negative_days(owner):
    lot = make_lot(owner, start_date=timezone.localdate() + timedelta(days=5))

    assert lot.days_on_feed == 0


def test_average_weight_ignores_entries_without_weight(owner):
    lot = make_lot(owner)
    add(lot, "acquisition", "1000.00", head_count=10, weight_kg=Decimal("3000"))
    add(lot, "acquisition", "500.00", head_count=5)  # pesagem não informada

    lot = fresh(lot)

    assert lot.heads_purchased == 15
    assert lot.avg_purchase_weight_kg == Decimal("300.00")


def test_negative_margin_when_sale_is_below_cost(owner):
    lot = make_lot(owner)
    add(lot, "acquisition", "1000.00", head_count=1)
    add(lot, "freight", "200.00")
    add(lot, "sale", "800.00", head_count=1)

    lot = fresh(lot)

    assert lot.profit == Decimal("-400.00")
    assert lot.margin_percent == Decimal("-50.00")


def test_every_cost_type_counts_in_total_cost(owner):
    lot = make_lot(owner)
    for entry_type in CattleLotEntry.COST_TYPES:
        kwargs = {"head_count": 1} if entry_type in CattleLotEntry.HEAD_COUNT_TYPES else {}
        add(lot, entry_type, "10.00", **kwargs)

    lot = fresh(lot)

    assert lot.total_cost == Decimal("10.00") * len(CattleLotEntry.COST_TYPES)
    assert CattleLotEntry.EntryType.SALE not in CattleLotEntry.COST_TYPES


def test_model_rejects_entry_whose_lot_belongs_to_another_tenant(owner, baker):
    lot = make_lot(owner)
    other_tenant = baker.make("tenants.Tenant", is_active=True, document="00000000001")
    entry = CattleLotEntry(
        user=lot.user, tenant=other_tenant, lot=lot, entry_type="feed", amount=Decimal("10.00"),
    )

    with pytest.raises(ValidationError) as exc:
        entry.save()

    assert "lot" in exc.value.message_dict


def test_lot_metrics_refresh_after_lot_save(owner):
    lot = fresh(make_lot(owner))
    assert lot.feed_cost == Decimal("0.00")  # popula o cache de totais
    add(lot, "feed", "40.00")

    lot.name = "Renomeado"
    lot.save()
    lot = fresh(lot)

    assert lot.feed_cost == Decimal("40.00")


def test_validate_delete_allows_non_acquisition_entries(owner):
    lot = make_lot(owner)
    add(lot, "acquisition", "1000.00", head_count=2)
    sale = add(lot, "sale", "1500.00", head_count=2)

    sale.validate_delete()  # não levanta
    sale.delete()


def test_end_date_equal_to_start_date_is_allowed(owner):
    lot = make_lot(owner, start_date=date(2026, 1, 1), end_date=date(2026, 1, 1))

    assert lot.days_on_feed == 0
