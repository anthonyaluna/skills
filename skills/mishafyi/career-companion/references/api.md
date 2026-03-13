# Zero G Talent API Reference

All endpoints are public — no authentication required.

## Search Jobs

```
GET https://zerogtalent.com/api/jobs/search
```

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Full-text + fuzzy keyword search |
| `company` | string | — | Company slug filter |
| `location` | string | — | Location slug (e.g., `california`, `remote`, `texas`, `new-york`) |
| `employmentType` | string | — | `full-time`, `internship`, `part-time`, `contract` |
| `remote` | string | — | `true` for remote-only jobs |
| `limit` | number | 20 | Results per page (max 50) |
| `offset` | number | 0 | Pagination offset |
### JSON Response

```json
{
  "jobs": [
    {
      "title": "Research Scientist, Alignment",
      "slug": "research-scientist-alignment",
      "externalId": "abc-123-def",
      "location": "San Francisco, CA",
      "remote": false,
      "employmentType": "Full-time",
      "category": "Research",
      "isActive": true,
      "salaryMin": 200000,
      "salaryMax": 350000,
      "salaryCurrency": "USD",
      "salaryInterval": "YEAR",
      "company": {
        "name": "Anthropic",
        "slug": "anthropic",
        "logoUrl": "https://zerogtalent.com/logos/anthropic.png"
      }
    }
  ],
  "total": 42,
  "hasMore": true,
  "pagination": { "offset": 0, "limit": 20, "total": 42 }
}
```

## Get Job Description

```
GET https://zerogtalent.com/api/job?company={company-slug}&jobId={externalId}
```

Returns the full JSON job object including title, company, location, salary, and the HTML `description` field.

**Important:** Use `externalId` from search results, never the `slug`. The `slug` is for URL display only.

## Job Detail Page URLs

Link to the Zero G Talent job page (not the direct ATS URL) for a better experience:

```
https://zerogtalent.com/space-jobs/{company-slug}/{job-slug}
```

Both `company-slug` (from `company.slug`) and `job-slug` (from `slug`) come from the search response.
