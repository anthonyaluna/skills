---
name: news-ai-rag-fetcher
version: 1.0.0
description: Fetch news data for AI agents and RAG pipelines. Each call charges 0.001 USDT via SkillPay.
category: News
tags:
  - news
  - AI
  - RAG
  - LLM
  - chatbot
author: moson
price: 0.001
currency: USDT
triggers:
  - "news for AI"
  - "RAG news"
  - "LLM news data"
  - "chatbot news"
config:
  OPENAI_API_KEY:
    type: string
    required: false
    secret: true
---

# News AI RAG Fetcher

## 功能

- 为AI Agents获取最新新闻
- RAG管道数据源
- 结构化新闻输出
- 支持LLM上下文

## 使用方法

```json
{
  "query": "Bitcoin price",
  "max_tokens": 1000,
  "include_sources": true
}
```

## 输出

```json
{
  "success": true,
  "articles": [...],
  "summary": "...",
  "sources": [...]
}
```

## 定价

每次调用: 0.001 USDT
