#!/usr/bin/env python3
"""Test all imported workflow templates by executing them."""
import json
import urllib.request

N8N_URL = "http://localhost:5678"

def login():
    data = json.dumps({"emailOrLdapLoginId": "zyph077@gmail.com", "password": "Password1"}).encode()
    req = urllib.request.Request(f"{N8N_URL}/rest/login", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    cookie = resp.headers.get("Set-Cookie", "")
    return cookie

def get_workflows(cookie):
    req = urllib.request.Request(f"{N8N_URL}/rest/workflows", headers={"Cookie": cookie})
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result.get("data", [])

def get_workflow(cookie, wf_id):
    req = urllib.request.Request(f"{N8N_URL}/rest/workflows/{wf_id}", headers={"Cookie": cookie})
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result.get("data", result)

def run_workflow(cookie, workflow):
    """Run a workflow manually and return execution results."""
    # Find the start/trigger node
    nodes = workflow.get("nodes", [])
    start_node = None
    for node in nodes:
        node_type = node.get("type", "")
        if "manualTrigger" in node_type or "scheduleTrigger" in node_type:
            start_node = node.get("name")
            break
        if "Trigger" in node_type:
            start_node = node.get("name")
            break

    if not start_node:
        return {"error": "No trigger node found"}

    payload = {
        "startNodes": [{"name": start_node, "sourceData": None}],
        "runData": {},
        "workflowData": workflow,
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{N8N_URL}/rest/workflows/{workflow['id']}/run",
        data=data,
        headers={"Content-Type": "application/json", "Cookie": cookie},
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        return result.get("data", result)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HTTP {e.code}", "body": body[:300]}
    except Exception as e:
        return {"error": str(e)}

def analyze_results(result):
    """Extract useful info from execution results."""
    if "error" in result:
        return f"ERROR: {result['error']}"

    run_data = result.get("resultData", {}).get("runData", {})
    if not run_data:
        return "No run data returned"

    summary = []
    for node_name, runs in run_data.items():
        for run in runs:
            status = run.get("executionStatus", "?")
            error = run.get("error")
            items = []
            for main_output in run.get("data", {}).get("main", []):
                if main_output:
                    items.extend(main_output)

            if error:
                summary.append(f"  {node_name}: FAILED - {error.get('message', str(error))[:100]}")
            else:
                item_count = len(items)
                first_keys = list(items[0].get("json", {}).keys())[:5] if items else []
                summary.append(f"  {node_name}: {status} ({item_count} items) keys={first_keys}")

    return "\n".join(summary) if summary else "Empty results"

def main():
    cookie = login()
    workflows = get_workflows(cookie)

    # Filter to our template workflows (skip "test" and "Test" workflows)
    template_workflows = [w for w in workflows if w.get("name", "").startswith(("Daily", "Price Alert", "AI Agent", "New Polymarket", "Polymarket Portfolio"))]

    if not template_workflows:
        # Just get all workflows
        template_workflows = workflows

    for wf in template_workflows:
        wf_id = wf["id"]
        name = wf["name"]
        print(f"\n=== {name} (id: {wf_id}) ===")

        # Get full workflow data
        full_wf = get_workflow(cookie, wf_id)

        # List nodes
        nodes = full_wf.get("nodes", [])
        print(f"  Nodes: {[n.get('name') for n in nodes]}")

        # Find polymarket nodes
        poly_nodes = [n for n in nodes if "polymarket" in n.get("type", "").lower()]
        print(f"  Polymarket nodes: {len(poly_nodes)}")

        # Try running
        print(f"  Running...")
        result = run_workflow(cookie, full_wf)
        analysis = analyze_results(result)
        print(analysis)

if __name__ == "__main__":
    main()
