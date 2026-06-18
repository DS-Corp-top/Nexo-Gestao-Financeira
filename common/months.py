from datetime import date


def month_value_to_date(month_value):
    if not month_value:
        return None

    try:
        year, month = month_value.split("-")
        return date(int(year), int(month), 1)
    except (TypeError, ValueError):
        return None


def shift_month(base_month, delta):
    month_index = (base_month.month - 1) + delta
    year = base_month.year + (month_index // 12)
    month = (month_index % 12) + 1
    return date(year, month, 1)


def month_bounds(selected_month):
    next_month = shift_month(selected_month, 1)
    return selected_month, next_month
