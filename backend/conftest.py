import pytest
from model_bakery import baker as _baker


@pytest.fixture
def baker():
    return _baker
