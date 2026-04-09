#!/usr/bin/env python3
"""Import marketing workflows into production n8n instance."""
import json
import os
import urllib.request

N8N_URL = "http://localhost:5679"
WORKFLOWS_DIR = os.path.join(os.path.dirname(__file__), "..", "packages", "n8n-nodes", "workflows", "marketing")

def login():
    data = json.dumps({"emailOrLdapLoginId": "zyph077@gmail.com", "password": "Password!234"}).encode()
    req = urllib.request.Request(f"{N8N_URL}/rest/login", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    cookie = resp.headers.get("Set-Cookie", "")
    return cookie

def import_workflow(cookie, filepath):
    with open(filepath) as f:
        workflow = json.load(f)
    for key in ["tags", "meta", "id"]:
        workflow.pop(key, None)
    for node in workflow.get("nodes", []):
        node.pop("id", None)
    data = json.dumps(workflow).encode()
    req = urllib.request.Request(
        f"{N8N_URL}/rest/workflows",
        data=data,
        headers={"Content-Type": "application/json", "Cookie": cookie},
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result.get("data", {}).get("id", "unknown")

def main():
    cookie = login()
    templates = sorted(f for f in os.listdir(WORKFLOWS_DIR) if f.endswith(".json"))
    for template in templates:
        filepath = os.path.join(WORKFLOWS_DIR, template)
        try:
            wf_id = import_workflow(cookie, filepath)
            print(f"  OK  {template} -> {wf_id}")
        except Exception as e:
            print(f"  FAIL  {template} -> {e}")

if __name__ == "__main__":
    main()
