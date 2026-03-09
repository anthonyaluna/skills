# Skill Hub Gateway（简体中文）

默认 API 地址：`https://gateway-api.binaryworks.app`

英文文档：`SKILL.md`

## 首次接入（install_code）

脚本默认会自动完成接入流程：

1. 调用 `POST /agent/install-code/issue`，请求体可用 `{"channel":"local"}` 或 `{"channel":"clawhub"}`。
2. 读取 `data.install_code`。
3. 调用 `POST /agent/bootstrap`，请求体：`{"agent_uid":"<agent_uid>","install_code":"<install_code>"}`。
4. 读取 `data.api_key`，后续通过 `X-API-Key` 或 `Authorization: Bearer <api_key>` 调用。

手工覆盖方式：

- 仍可显式传入 `api_key`。
- 若设置了 `SKILL_API_KEY`，脚本会优先使用该值。

## 运行时协议（V2）

- 提交：`POST /skill/execute`
- 轮询：`GET /skill/runs/:run_id`
- 图片类能力要求 `image_url` 为可直接下载图片的直链（返回头应为 `image/*`），不能是网页地址。
- 终态：`succeeded` / `failed`
- `succeeded` 返回 `output`
- `failed` 返回 `error.code`、`error.message`

## 能力 ID

- `human_detect`
- `image_tagging`
- `tts_report`
- `embeddings`
- `reranker`
- `asr`
- `tts_low_cost`
- `markdown_convert`

## 打包脚本参数

- `scripts/execute.mjs`：`[api_key] [capability] [input_json] [base_url] [agent_uid] [owner_uid_hint]`
- `scripts/poll.mjs`：`[api_key] <run_id> [base_url] [agent_uid] [owner_uid_hint]`
- `scripts/runtime-auth.mjs`：共享自动 bootstrap 与本地鉴权缓存逻辑
