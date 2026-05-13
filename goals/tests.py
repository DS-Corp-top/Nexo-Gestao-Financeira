"""Tests for goals app."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from goals.models import SavingGoal


class GoalViewTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="goal-user",
            email="goal-user@example.com",
            password="secret123",
        )
        self.client.force_login(self.user)

    def test_create_goal_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("goals:create"),
            {
                "name": "Viagem",
                "target_amount": "3500.00",
                "target_date": "2026-12-31",
                "is_active": "on",
            },
        )

        self.assertRedirects(response, reverse("goals:list"))
        goal = SavingGoal.objects.get(name="Viagem")
        self.assertEqual(goal.user, self.user)
        self.assertIsNotNone(goal.tenant)
