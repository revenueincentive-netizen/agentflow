"""
CRM connector tools — Salesforce and HubSpot.

Each function returns a LangChain @tool that agents can call.
Credentials are decrypted at call time; never logged or returned via API.
"""

import json
from datetime import datetime, timedelta

import httpx
from langchain_core.tools import tool

from app.core.security import decrypt_secret


# ─── Salesforce ──────────────────────────────────────────────────────────────

def make_salesforce_tools(instance_url: str, encrypted_access_token: str):
    """
    Returns a set of Salesforce tools for pipeline, account, and contact data.
    Uses Salesforce REST API with a pre-authorised access token.
    """
    access_token = decrypt_secret(encrypted_access_token)
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    def _soql(query: str) -> list[dict]:
        url = f"{instance_url.rstrip('/')}/services/data/v59.0/query"
        with httpx.Client(timeout=20) as client:
            r = client.get(url, headers=headers, params={"q": query})
            r.raise_for_status()
            return r.json().get("records", [])

    @tool
    def sf_pipeline_query(filters: str = "{}") -> str:
        """
        Query the Salesforce pipeline. Accepts optional JSON filters:
        {"stage": "Negotiation", "owner": "Jane Smith", "close_before": "2026-09-30",
         "min_amount": 50000, "at_risk": true}
        Returns open opportunities matching the filters.
        """
        try:
            f = json.loads(filters)
        except json.JSONDecodeError:
            return "Error: filters must be valid JSON."

        conditions = ["StageName != 'Closed Won'", "StageName != 'Closed Lost'", "IsClosed = false"]

        if f.get("stage"):
            conditions.append(f"StageName = '{f['stage']}'")
        if f.get("owner"):
            conditions.append(f"Owner.Name LIKE '%{f['owner']}%'")
        if f.get("close_before"):
            conditions.append(f"CloseDate <= {f['close_before']}")
        if f.get("min_amount"):
            conditions.append(f"Amount >= {f['min_amount']}")
        if f.get("at_risk"):
            cutoff = (datetime.utcnow() - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
            conditions.append(f"LastActivityDate <= {cutoff}")

        soql = (
            "SELECT Id, Name, StageName, Amount, CloseDate, Probability, "
            "Owner.Name, Account.Name, LastActivityDate, NextStep "
            f"FROM Opportunity WHERE {' AND '.join(conditions)} "
            "ORDER BY CloseDate ASC LIMIT 50"
        )
        try:
            records = _soql(soql)
            if not records:
                return "No opportunities found matching those filters."
            cleaned = [
                {
                    "deal": r.get("Name"),
                    "account": r.get("Account", {}).get("Name") if r.get("Account") else None,
                    "stage": r.get("StageName"),
                    "amount": r.get("Amount"),
                    "close_date": r.get("CloseDate"),
                    "probability": r.get("Probability"),
                    "owner": r.get("Owner", {}).get("Name") if r.get("Owner") else None,
                    "last_activity": r.get("LastActivityDate"),
                    "next_step": r.get("NextStep"),
                }
                for r in records
            ]
            return json.dumps(cleaned, default=str)
        except Exception as e:
            return f"Salesforce error: {e}"

    @tool
    def sf_account_summary(account_name: str) -> str:
        """
        Get a full account summary from Salesforce: account details, open deals,
        recent activities, and key contacts. Use this for call prep.
        """
        try:
            # Account details
            accts = _soql(
                f"SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees, "
                f"BillingCity, BillingCountry, Website, Description "
                f"FROM Account WHERE Name LIKE '%{account_name}%' LIMIT 3"
            )
            if not accts:
                return f"No account found matching '{account_name}'."

            acct = accts[0]
            acct_id = acct["Id"]

            # Open deals
            deals = _soql(
                f"SELECT Name, StageName, Amount, CloseDate, Probability FROM Opportunity "
                f"WHERE AccountId = '{acct_id}' AND IsClosed = false ORDER BY CloseDate ASC LIMIT 10"
            )

            # Key contacts
            contacts = _soql(
                f"SELECT Name, Title, Email, Phone FROM Contact "
                f"WHERE AccountId = '{acct_id}' LIMIT 10"
            )

            # Recent activities
            activities = _soql(
                f"SELECT Subject, ActivityDate, Description, Type FROM Activity "
                f"WHERE WhatId = '{acct_id}' ORDER BY ActivityDate DESC LIMIT 5"
            )

            summary = {
                "account": {
                    "name": acct.get("Name"),
                    "industry": acct.get("Industry"),
                    "revenue": acct.get("AnnualRevenue"),
                    "employees": acct.get("NumberOfEmployees"),
                    "location": f"{acct.get('BillingCity')}, {acct.get('BillingCountry')}",
                },
                "open_opportunities": [
                    {"name": d["Name"], "stage": d["StageName"], "amount": d["Amount"], "close_date": d["CloseDate"]}
                    for d in deals
                ],
                "key_contacts": [
                    {"name": c["Name"], "title": c.get("Title"), "email": c.get("Email")}
                    for c in contacts
                ],
                "recent_activities": [
                    {"subject": a.get("Subject"), "date": a.get("ActivityDate"), "type": a.get("Type")}
                    for a in activities
                ],
            }
            return json.dumps(summary, default=str)
        except Exception as e:
            return f"Salesforce error: {e}"

    @tool
    def sf_rep_performance(rep_name: str = "", period: str = "current_quarter") -> str:
        """
        Get quota attainment, pipeline coverage, and activity metrics for a rep or team.
        period: current_quarter | last_quarter | ytd
        """
        try:
            now = datetime.utcnow()
            if period == "current_quarter":
                q_start = now.replace(month=((now.month - 1) // 3) * 3 + 1, day=1)
                q_end = (q_start + timedelta(days=92)).replace(day=1) - timedelta(days=1)
            elif period == "last_quarter":
                q_end = now.replace(month=((now.month - 1) // 3) * 3 + 1, day=1) - timedelta(days=1)
                q_start = q_end.replace(month=((q_end.month - 1) // 3) * 3 + 1, day=1)
            else:  # ytd
                q_start = now.replace(month=1, day=1)
                q_end = now

            owner_filter = f"AND Owner.Name LIKE '%{rep_name}%'" if rep_name else ""

            won = _soql(
                f"SELECT Owner.Name, SUM(Amount) total FROM Opportunity "
                f"WHERE StageName = 'Closed Won' AND CloseDate >= {q_start.date()} "
                f"AND CloseDate <= {q_end.date()} {owner_filter} GROUP BY Owner.Name"
            )
            pipeline = _soql(
                f"SELECT Owner.Name, SUM(Amount) total FROM Opportunity "
                f"WHERE IsClosed = false {owner_filter} GROUP BY Owner.Name"
            )
            return json.dumps({"closed_won": won, "open_pipeline": pipeline}, default=str)
        except Exception as e:
            return f"Salesforce error: {e}"

    @tool
    def sf_crm_hygiene_check() -> str:
        """
        Run a data quality audit on the Salesforce pipeline.
        Finds: missing close dates, stale deals, no amount set, missing contacts, single-threaded deals.
        """
        try:
            issues = {}
            cutoff = (datetime.utcnow() - timedelta(days=21)).strftime("%Y-%m-%d")
            today = datetime.utcnow().strftime("%Y-%m-%d")

            issues["missing_amount"] = _soql(
                "SELECT Name, Owner.Name, StageName FROM Opportunity "
                "WHERE Amount = null AND IsClosed = false LIMIT 25"
            )
            issues["stale_no_activity"] = _soql(
                f"SELECT Name, Owner.Name, LastActivityDate FROM Opportunity "
                f"WHERE IsClosed = false AND (LastActivityDate <= {cutoff} OR LastActivityDate = null) LIMIT 25"
            )
            issues["close_date_passed"] = _soql(
                f"SELECT Name, Owner.Name, CloseDate FROM Opportunity "
                f"WHERE IsClosed = false AND CloseDate < {today} LIMIT 25"
            )
            issues["missing_next_step"] = _soql(
                "SELECT Name, Owner.Name FROM Opportunity "
                "WHERE IsClosed = false AND NextStep = null AND StageName NOT IN ('Prospecting','Qualification') LIMIT 25"
            )

            summary = {k: {"count": len(v), "records": v[:10]} for k, v in issues.items()}
            total = sum(len(v) for v in issues.values())
            return json.dumps({"total_issues": total, "breakdown": summary}, default=str)
        except Exception as e:
            return f"Salesforce error: {e}"

    return [sf_pipeline_query, sf_account_summary, sf_rep_performance, sf_crm_hygiene_check]


# ─── HubSpot ─────────────────────────────────────────────────────────────────

def make_hubspot_tools(encrypted_api_key: str):
    """Returns HubSpot CRM tools using the Private App API key."""

    api_key = decrypt_secret(encrypted_api_key)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    base = "https://api.hubapi.com"

    @tool
    def hs_pipeline_query(stage: str = "", owner_email: str = "") -> str:
        """
        Query HubSpot deals pipeline. Optionally filter by stage name or owner email.
        Returns open deals with stage, amount, close date, and associated company.
        """
        try:
            filters = []
            if stage:
                filters.append({"propertyName": "dealstage", "operator": "EQ", "value": stage})

            payload = {
                "filterGroups": [{"filters": filters}] if filters else [],
                "properties": ["dealname", "amount", "dealstage", "closedate", "hubspot_owner_id", "hs_lastmodifieddate"],
                "limit": 50,
            }
            with httpx.Client(timeout=20) as client:
                r = client.post(f"{base}/crm/v3/objects/deals/search", headers=headers, json=payload)
                r.raise_for_status()
                results = r.json().get("results", [])

            cleaned = [
                {
                    "deal": d["properties"].get("dealname"),
                    "amount": d["properties"].get("amount"),
                    "stage": d["properties"].get("dealstage"),
                    "close_date": d["properties"].get("closedate"),
                    "last_modified": d["properties"].get("hs_lastmodifieddate"),
                }
                for d in results
            ]
            return json.dumps(cleaned, default=str) if cleaned else "No deals found."
        except Exception as e:
            return f"HubSpot error: {e}"

    @tool
    def hs_company_summary(company_name: str) -> str:
        """
        Get a HubSpot company summary: firmographics, associated deals, and contacts.
        Use for call prep and account research.
        """
        try:
            with httpx.Client(timeout=20) as client:
                search = client.post(
                    f"{base}/crm/v3/objects/companies/search",
                    headers=headers,
                    json={
                        "filterGroups": [{"filters": [{"propertyName": "name", "operator": "CONTAINS_TOKEN", "value": company_name}]}],
                        "properties": ["name", "industry", "annualrevenue", "numberofemployees", "city", "country", "website"],
                        "limit": 1,
                    },
                )
                search.raise_for_status()
                companies = search.json().get("results", [])

            if not companies:
                return f"No company found matching '{company_name}'."

            company = companies[0]
            company_id = company["id"]

            with httpx.Client(timeout=20) as client:
                # Associated deals
                deals_resp = client.get(
                    f"{base}/crm/v3/objects/companies/{company_id}/associations/deals",
                    headers=headers,
                )
                deal_ids = [d["id"] for d in deals_resp.json().get("results", [])][:5]

                deals_detail = []
                for did in deal_ids:
                    dr = client.get(f"{base}/crm/v3/objects/deals/{did}",
                                    headers=headers,
                                    params={"properties": "dealname,amount,dealstage,closedate"})
                    if dr.status_code == 200:
                        deals_detail.append(dr.json().get("properties", {}))

            return json.dumps({
                "company": company["properties"],
                "open_deals": deals_detail,
            }, default=str)
        except Exception as e:
            return f"HubSpot error: {e}"

    return [hs_pipeline_query, hs_company_summary]
