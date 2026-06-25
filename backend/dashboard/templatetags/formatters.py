from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django import template

register = template.Library()


@register.filter(name="brl")
def brl(value):
    """Format numeric values as Brazilian currency (R$ 1.234,56)."""
    if value in (None, ""):
        amount = Decimal("0")
    else:
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            amount = Decimal("0")

    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if quantized < 0 else ""
    quantized = abs(quantized)

    integer_part, decimal_part = f"{quantized:.2f}".split(".")
    integer_part = f"{int(integer_part):,}".replace(",", ".")

    return f"{sign}R$ {integer_part},{decimal_part}"
