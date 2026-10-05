import os
import unittest
from unittest.mock import patch

from pipeline import configuration, identity


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.environment = {"SOURCE_BASE_URL": "https://api.example.test/", "SOURCE_API_TOKEN": "test-only",
                            "PGHOST": "postgres", "PGDATABASE": "warehouse", "PGUSER": "loader", "PGPASSWORD": "test-only"}

    def test_explicit_merge_and_incremental_contract(self):
        with patch.dict(os.environ, self.environment, clear=True):
            config, credentials = configuration()
        self.assertEqual(config["resources"][0]["write_disposition"], "merge")
        self.assertEqual(config["resources"][0]["endpoint"]["incremental"]["lag"], 3600)
        self.assertEqual(config["client"]["paginator"]["base_page"], 1)
        self.assertEqual(credentials["connect_timeout"], 10)

    def test_cleartext_rejected_except_explicit_fixture_opt_in(self):
        self.environment["SOURCE_BASE_URL"] = "http://fixture:8000/"
        with patch.dict(os.environ, self.environment, clear=True), self.assertRaises(ValueError):
            configuration()
        self.environment["ALLOW_INSECURE_SOURCE"] = "true"
        with patch.dict(os.environ, self.environment, clear=True):
            configuration()

    def test_missing_token_rejected(self):
        self.environment.pop("SOURCE_API_TOKEN")
        with patch.dict(os.environ, self.environment, clear=True), self.assertRaises(ValueError):
            configuration()

    def test_unsafe_dataset_rejected(self):
        with patch.dict(os.environ, {"DATASET_NAME": "x; DROP SCHEMA public"}), self.assertRaises(ValueError):
            identity("DATASET_NAME", "warehouse")

    def test_external_endpoint_rejected(self):
        self.environment["SOURCE_ENDPOINT"] = "https://other.example.test"
        with patch.dict(os.environ, self.environment, clear=True), self.assertRaises(ValueError):
            configuration()
