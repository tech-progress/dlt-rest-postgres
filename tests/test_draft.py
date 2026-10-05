import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("draft", Path(__file__).resolve().parent.parent / "scripts/draft.py")
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)


class DraftTests(unittest.TestCase):
    def test_null_optional_sdk_settings(self):
        database = self.graph["graph"]["resources"][0]
        database.update(build=None, deploy=None)
        result = draft.restore(self.shell, self.graph)
        self.assertEqual(result["services"]["local-test-database"]["build"], {})
        self.assertEqual(result["services"]["local-test-database"]["deploy"], {
            "startCommand": None, "healthcheckPath": None, "healthcheckTimeout": None
        })
        draft.audit(result, self.graph)

    def setUp(self):
        self.graph = {"graph": {"resources": [
            {"type": "service", "name": "Postgres", "source": {"image": "postgres:test-only"}},
            {"type": "service", "name": "dlt Loader", "source": {"repo": "local-test/local-test", "branch": "local-test", "rootDirectory": "/"},
             "deploy": {"cronSchedule": "0 * * * *", "restartPolicyType": "NEVER", "numReplicas": 1}},
        ]}}
        self.shell = {"services": {
            "local-test-database": {"name": "Postgres", "volumeMounts": {"local-test-volume": {}}},
            "local-test-loader": {"name": "dlt Loader", "source": {"image": "stale"},
                                  "deploy": {"startCommand": "stale"}, "networking": {"tcpProxies": {"stale": {}}}},
        }}

    def test_restores_and_rejects_drift(self):
        result = draft.restore(self.shell, self.graph)
        self.assertEqual(set(result["services"]), set(self.shell["services"]))
        draft.audit(result, self.graph)
        for field in ("source", "deploy", "networking", "variables", "volumeMounts"):
            modified = copy.deepcopy(result)
            modified["services"]["local-test-database"][field] = {"wrong": "wrong"}
            with self.assertRaises((AssertionError, KeyError, TypeError)):
                draft.audit(modified, self.graph)

    def test_refuses_missing_volume_and_unknown_services(self):
        del self.shell["services"]["local-test-database"]["volumeMounts"]
        with self.assertRaises(ValueError):
            draft.restore(self.shell, self.graph)
        self.shell["services"]["local-test-other"] = {"name": "Other"}
        with self.assertRaises(ValueError):
            draft.restore(self.shell, self.graph)
