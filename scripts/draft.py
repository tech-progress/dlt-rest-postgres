import argparse
import copy
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent.parent


def load(path):
    return json.loads(Path(path).read_text())


def desired(graph):
    return {resource["name"]: resource for resource in graph["graph"]["resources"] if resource["type"] == "service"}


def config(document):
    if "data" in document:
        document = document["data"]["template"]["serializedConfig"]
    if isinstance(document, str):
        document = json.loads(document)
    if not isinstance(document.get("services"), dict):
        raise ValueError("Expected an exported Composer serializedConfig with services keyed by their existing IDs")
    return document


def contracts():
    return (load(ROOT / "template-defaults.json"), load(ROOT / "template-descriptions.json"),
            load(ROOT / "template-networking.json"), load(ROOT / "template-volumes.json"))


def source(resource):
    upstream = resource["source"]
    if upstream.get("image"):
        return {"image": upstream["image"]}
    return {key: upstream[key] for key in ("repo", "branch", "rootDirectory")}


def restore(document, graph):
    candidate = copy.deepcopy(config(document))
    resources = desired(graph)
    if sorted(service["name"] for service in candidate["services"].values()) != sorted(resources):
        raise ValueError("Draft service-name set mismatch; export a shell with exactly the intended services")
    defaults, descriptions, networking, volumes = contracts()
    for service in candidate["services"].values():
        name = service["name"]
        resource = resources[name]
        service["source"] = source(resource)
        service["build"] = resource.get("build") or {}
        service["deploy"] = dict(resource.get("deploy") or {}, startCommand=None, healthcheckPath=None, healthcheckTimeout=None)
        service["variables"] = {
            key: {"defaultValue": value or None, "description": descriptions[name][key], "isOptional": False}
            for key, value in defaults[name].items()
        }
        service["networking"] = {"serviceDomains": {}, "customDomains": {}, "tcpProxies": {}}
        mounts = service.get("volumeMounts", {})
        if name in volumes:
            if not isinstance(mounts, dict) or len(mounts) != 1:
                raise ValueError(f"{name} must already have exactly one Composer volume; IDs are never invented")
            for mount in mounts.values():
                mount.update(mountPath=volumes[name]["mountPath"], sizeMB=volumes[name]["sizeMB"])
        elif mounts:
            raise ValueError(f"Unexpected volume on {name}; remove it in Composer first")
        else:
            service["volumeMounts"] = {}
    audit(candidate, graph)
    return candidate


def audit(document, graph):
    candidate = config(document)
    resources = desired(graph)
    defaults, descriptions, networking, volumes = contracts()
    assert sorted(service["name"] for service in candidate["services"].values()) == sorted(resources), "Service set mismatch"
    seen_mounts = set()
    for service in candidate["services"].values():
        name = service["name"]
        resource = resources[name]
        assert service["source"] == source(resource), f"Source mismatch: {name}"
        assert service.get("build", {}) == (resource.get("build") or {}), f"Build mismatch: {name}"
        deploy = service.get("deploy", {})
        expected_deploy = dict(resource.get("deploy") or {}, startCommand=None, healthcheckPath=None, healthcheckTimeout=None)
        assert deploy == expected_deploy, f"Deploy/cron/restart mismatch: {name}"
        assert set(service["variables"]) == set(defaults[name]), f"Variable set mismatch: {name}"
        for key, value in defaults[name].items():
            variable = service["variables"][key]
            assert (variable.get("defaultValue") or "") == value, f"Default mismatch: {name}.{key}"
            assert variable.get("description") == descriptions[name][key], f"Description mismatch: {name}.{key}"
            assert variable.get("isOptional") is False, f"Required flag mismatch: {name}.{key}"
            assert not any(variable.get(field) for field in ("value", "encryptedValue", "generator")), f"Resolved/stale secret in {name}.{key}"
        assert service.get("networking") == {"serviceDomains": {}, "customDomains": {}, "tcpProxies": {}}, f"Networking mismatch: {name}"
        mounts = service.get("volumeMounts", {})
        if name in volumes:
            assert isinstance(mounts, dict) and len(mounts) == 1, f"Volume count mismatch: {name}"
            for mount_id, mount in mounts.items():
                assert mount_id not in seen_mounts, "Shared volume detected"
                seen_mounts.add(mount_id)
                assert mount["mountPath"] == volumes[name]["mountPath"] and mount["sizeMB"] == volumes[name]["sizeMB"], f"Volume mismatch: {name}"
        else:
            assert not mounts, f"Unexpected runner volume: {name}"


def main():
    parser = argparse.ArgumentParser(description="Offline Composer draft restoration/audit; never contacts Railway")
    parser.add_argument("mode", choices=("restore", "audit"))
    parser.add_argument("draft")
    parser.add_argument("graph")
    args = parser.parse_args()
    document, graph = load(args.draft), load(args.graph)
    if args.mode == "restore":
        json.dump(restore(document, graph), sys.stdout, indent=2)
        print()
    else:
        audit(document, graph)
        print("PASS: offline draft sources, cron, defaults, required flags, networking, volumes; no resolved secrets printed")


if __name__ == "__main__":
    main()
