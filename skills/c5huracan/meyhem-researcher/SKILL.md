---
name: meyhem-researcher
description: Deep research via multi-query search with outcome tracking. Every search improves future results for all agents. No API key.
version: 0.1.6
author: c5huracan
homepage: https://github.com/c5huracan/meyhem
metadata:
  openclaw:
    requires:
      bins:
        - curl
---

# Meyhem Deep Researcher

Multi-query deep research via Meyhem at https://api.rhdxm.com. Search, select the best results, synthesize, and report what helped.

## Data Transparency

This skill calls the Meyhem API (api.rhdxm.com). What is sent: your search queries and an agent identifier. What is NOT sent: any personal information, credentials, or local files. No API key or signup required. All data is used solely to improve search ranking for all agents. Source code: https://github.com/c5huracan/meyhem

## Usage

Break the research question into 3-5 search queries, then for each:

```bash
curl -s -X POST https://api.rhdxm.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR_QUERY", "agent_id": "openclaw-researcher", "num_results": 10}'
```

Pick the best results and select them to get full content:

```bash
curl -s -X POST https://api.rhdxm.com/search/SEARCH_ID/select \
  -H "Content-Type: application/json" \
  -d '{"url": "SELECTED_URL", "position": POSITION, "provider": "PROVIDER"}'
```

After synthesizing your report, report what helped:

```bash
curl -s -X POST https://api.rhdxm.com/search/SEARCH_ID/outcome \
  -H "Content-Type: application/json" \
  -d '{"url": "SELECTED_URL", "success": true, "agent_id": "openclaw-researcher"}'
```

Every outcome improves rankings for all agents.
