---
name: fund-news-daily
description: 基金新闻日报技能。从证券时报、中国证券报、证券日报三大权威财经平台抓取公募基金/基金行业政策类新闻。支持四种查询：今日新闻（默认）、过去七天新闻、指定日期新闻、指定日期范围新闻。使用场景：(1) 用户说"查今日基金新闻"、"基金新闻日报" → 今日新闻；(2) 用户说"查过去七天基金新闻"、"最近一周基金新闻" → 过去七天；(3) 用户说"查YYYY年MM月DD日基金新闻" → 指定日期；(4) 用户说"查YYYY年MM月DD日至YYYY年MM月DD日基金新闻" → 指定日期范围。**「过去七天」和「指定日期范围」查询支持生成Word文档**，格式严格对齐范本。严格过滤私募基金、访谈评论等无关内容。自包含完整功能，不依赖其他技能。
---

# 基金新闻日报

从三大权威财经平台抓取公募基金/基金行业政策新闻，结构化输出。**自包含完整功能，无需依赖其他技能。**

## 数据源（严格按此顺序输出）

1. **证券时报**：http://www.stcn.com/article/list/fund.html
2. **中国证券报**：https://www.cs.com.cn/tzjj/jjdt/
3. **证券日报**：http://www.zqrb.cn/fund/

## 内容筛选规则（严格执行）

### ✅ 必须抓取
- 公募基金相关所有新闻
- 基金行业监管/政策类新闻（含交易所、证监会等发布的基金相关政策）
- ETF 相关新闻

### ❌ 绝对过滤
- 私募基金相关内容
- 基金经理/机构人士访谈/专访内容
- 纯市场评论/分析类内容
- 非基金领域无关财经新闻
- 「x只ETF获融资净买入」类表述（x为任意数字/字符，如"5只ETF获融资净买入"、"多只ETF获融资净买入"）
- 「x月x日资金净流入」类表述（x为任意数字/字符，如"3月11日资金净流入"、"本月资金净流入"）
- 包含「ETF龙虎榜」「ETF 龙虎榜」「龙虎榜（ETF）」等关键词的内容

## 时间查询规则

| 查询类型 | 触发词 | 时间范围 |
|---------|--------|---------|
| 今日新闻 | "今日"、"今天"、默认查询 | 当日 00:00 - 当前时间 |
| 过去七天 | "过去七天"、"最近一周"、"近7天" | 当日向前推7天（含查询日） |
| 指定日期 | "YYYY年MM月DD日"、"YYYY-MM-DD" | 指定日期 00:00-24:00 |
| 指定日期范围 | "YYYY年MM月DD日至YYYY年MM月DD日"、"YYYY年MM月DD日 到 YYYY年MM月DD日" | 【初始日 00:00:00】到【截止日 23:59:59】 |

---

## 完整抓取方法

### 方法一：使用 Agent Browser CLI（推荐）

Agent Browser 是已安装的浏览器自动化工具，位于 `/root/.local/share/pnpm/agent-browser`

#### Step 1: 访问页面并获取快照

```bash
# 证券时报
agent-browser open "http://www.stcn.com/article/list/fund.html" --timeout 30000
agent-browser snapshot -c --timeout 20000

# 中国证券报
agent-browser open "https://www.cs.com.cn/tzjj/jjdt/" --timeout 30000
agent-browser snapshot -c --timeout 20000

# 证券日报
agent-browser open "http://www.zqrb.cn/fund/" --timeout 30000
agent-browser snapshot -c --timeout 20000

# 完成后关闭
agent-browser close
```

#### Step 2: 从快照提取新闻

快照输出格式示例：
```
- link "新闻标题" [ref=e1]:
    - /url: /article/detail/123456.html
- text: 03月10日 16:00
- text: 新闻摘要内容...
```

提取规则：
1. 找到 `link` 元素，获取标题和 URL
2. 检查相邻 `text` 元素中的时间戳
3. 过滤时间符合查询范围的新闻
4. 拼接完整 URL（相对路径需加域名前缀）

#### Step 3: 访问原文获取详细内容

```bash
agent-browser open "完整文章URL" --timeout 20000
agent-browser snapshot -c --timeout 15000
# 提取正文内容
agent-browser close
```

---

### 方法二：使用 curl 直接抓取

当 Agent Browser 不可用时，使用 curl 抓取：

#### 证券时报
```bash
curl -sL --connect-timeout 15 --max-time 30 \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "http://www.stcn.com/article/list/fund.html" | \
  grep -oP '<a[^>]*href="[^"]*"[^>]*>[^<]+</a>' | \
  grep -E "detail|article" | head -20
```

#### 中国证券报
```bash
curl -sL --connect-timeout 15 --max-time 30 \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "https://www.cs.com.cn/tzjj/jjdt/" | \
  grep -oP '<a[^>]*href="[^"]*"[^>]*>[^<]+</a>' | \
  grep -E "202603|t2026" | head -20
```

#### 证券日报
```bash
curl -sL --connect-timeout 15 --max-time 30 \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "http://www.zqrb.cn/fund/" | \
  grep -oP '<a[^>]*href="[^"]*"[^>]*>[^<]+</a>' | \
  grep -E "fund|jijindongtai" | head -20
```

---

## 完整工作流程

### Step 1: 解析查询类型
根据用户输入判断：
- 包含"今日/今天"或无时间词 → 今日新闻
- 包含"过去七天/最近一周/近7天" → 近7天新闻
- 包含"至/到"且两端均为日期格式 → 指定日期范围新闻（严格限定【初始日 00:00:00】到【截止日 23:59:59】）
- 包含日期格式但不含"至/到" → 指定日期新闻

### Step 2: 抓取三大平台

依次访问三个平台，使用 Agent Browser：
1. `agent-browser open` 访问列表页
2. `agent-browser snapshot -c` 获取页面结构
3. 解析快照，提取新闻标题、链接、时间
4. 按时间过滤符合条件的新闻
5. 访问原文页面获取内容概要

### Step 3: 过滤与排序

**过滤规则：**
```
保留关键词：基金、ETF、公募、REITs、FOF、监管、政策
排除关键词：私募、专访、访谈、评论员、观点（标题含）
排除标题模式：
  - 「\d+只ETF获融资净买入」「多只ETF获融资净买入」
  - 「\d+月\d+日资金净流入」「本月资金净流入」
  - 含「ETF龙虎榜」「ETF 龙虎榜」「龙虎榜（ETF）」关键词
```

**排序规则：**
- 多日期新闻按发布时间倒序
- 同一平台内最新在前

### Step 4: 格式化输出

```
【基金新闻专属汇总】
查询类型：□今日新闻 □过去七天新闻 □指定日期新闻（{具体日期}） □指定日期范围新闻（{起始日期} 至 {截止日期}）
汇总时间：YYYY年MM月DD日 HH:MM

1. 证券时报
├── 发布时间：MM月DD日 HH:MM
│   新闻标题：{原文标题，无删改}
│   内容概要：{摘抄原文核心内容，保留关键数据/政策条款}
│   新闻链接：{官方原文链接}
├── ...
└── （无内容则标注「本平台当日无符合规则新闻」）

2. 中国证券报
├── ...
└── （无内容则标注「本平台当日无符合规则新闻」）

3. 证券日报
├── ...
└── （无内容则标注「本平台当日无符合规则新闻」）
```

---

## 执行要求

1. **链接准确性**：URL 必须是官方原文链接
   - 证券时报：`http://www.stcn.com/article/detail/XXXXXXX.html`
   - 中国证券报：`https://www.cs.com.cn/tzjj/jjdt/202603/t20260310_XXXXXXX.html`
   - 证券日报：`http://www.zqrb.cn/fund/jijindongtai/2026-03-10/AXXXXXXXX.html`

2. **内容保真**：
   - 标题原封不动，不删改
   - 内容概要严格摘抄原文，保留关键数据
   - 不做主观改写、总结、评论

3. **一一对应**：标题/内容/链接必须对应，无错配

4. **防爬控制**：
   - 每次请求间隔 2-3 秒
   - 使用 `--timeout` 参数控制超时
   - 避免频繁请求同一平台

5. **日期校验**：
   - 指定日期格式错误时提示：「请输入正确日期格式：YYYY年MM月DD日」

---

## 调用示例

| 用户输入 | 行为 |
|---------|------|
| "查今日基金新闻" | 今日新闻 |
| "基金新闻日报" | 今日新闻（默认） |
| "查过去七天基金新闻" | 过去七天新闻 |
| "查2026年03月10日基金新闻" | 指定日期新闻 |
| "查2026年03月01日至2026年03月10日基金新闻" | 指定日期范围新闻 |
| "查2026年3月1日到3月10日基金新闻" | 指定日期范围新闻 |

---

## 快速命令参考

```bash
# 完整抓取流程
agent-browser open "http://www.stcn.com/article/list/fund.html"
agent-browser snapshot -c
# 解析新闻列表...
agent-browser open "https://www.cs.com.cn/tzjj/jjdt/"
agent-browser snapshot -c
# 解析新闻列表...
agent-browser open "http://www.zqrb.cn/fund/"
agent-browser snapshot -c
# 解析新闻列表...
agent-browser close
```

---

## Word文档生成功能

**适用范围**：仅限「指定日期范围查询」和「过去七天查询」两种场景

### 一、文件命名规则

| 查询类型 | 命名格式 | 示例 |
|---------|---------|------|
| 指定日期范围 | `{起始日期YYYYMMDD}-{截止日期YYYYMMDD}基金新闻.docx` | `20260302-20260306基金新闻.docx` |
| 过去七天 | `{查询当日倒推6天YYYYMMDD}-{查询当日YYYYMMDD}基金新闻.docx` | 查询日20260306 → `20260301-20260306基金新闻.docx` |

### 二、文档整体结构

- **无页眉/页脚**：正文直接开始
- **无封面/目录**：按日期顺序直接排版
- **按日期分块**：不同日期新闻以独立日期段落分隔，无跨日期合并

### 三、核心排版格式（严格对齐范本）

#### （1）日期分组段落

- **分页规则**：每个新日期新起一页（除第一个日期外）
- **样式**：Normal、不加粗、无项目符号
- **格式**：纯数字 `YYYY.M.D`（月/日为单个数字时直接显示，无补零）
  - 正确示例：`2026.3.2`、`2026.3.6`
  - 错误示例：`2026.03.02`、`2026-03-06`
- **位置**：分页后新页的首个独立段落，单独成行，上方无需空行，下方留一行空行

#### （2）单条新闻排版（固定3段式）

**段落1：新闻正文段**
- **前缀**：使用项目符号（• 或其他默认符号）
- **字体**：等线（中文正文）11号
- **内容结构**：`{新闻标题}。{新闻完整正文}`
  - **标题**：加粗
  - **中文句号**：不加粗
  - **正文**：不加粗
  - 标题与正文之间用中文句号 `。` 衔接
  - 无分段，保持单一段落
- **要求**：
  - 剔除所有冗余标注（如「发布时间」「新闻标题」「内容概要」等标签）
  - 仅保留纯文字内容

**段落2：原始网页链接段**
- **样式**：Normal、不加粗、无项目符号
- **字体**：等线（中文正文）11号
- **位置**：紧跟新闻正文段下方，单独成行
- **内容**：直接输出原始新闻链接URL
- **要求**：完全跳过所有图片标识（如 `![img](xxx)`），仅保留链接文本

**段落3：来源信息段**
- **样式**：Normal、不加粗、无项目符号
- **字体**：等线（中文正文）11号
- **位置**：紧跟链接段下方，单独成行
- **内容格式**：`{来源媒体}，{新闻标题} {来源媒体}`
- **示例**：
  - `中证金牛座，全市场ETF突破1400只，易方达122只数量居首 中证金牛座`
  - `证券日报，油气与黄金两大主题ETF集体大涨 机构密集提示溢价风险 证券日报`

#### （3）通用排版要求

- **空行规则**：单日期下有多条新闻时，新闻之间保留一行空行
- **对齐方式**：所有文字无缩进、左对齐
- **样式统一**：全程使用 Normal 样式，仅通过「加粗/不加粗」区分内容
- **去重规则**：剔除重复新闻内容

#### （4）新闻排序规则（严格执行）

**一级排序：按发布日期**
- 所有新闻按发布日期（YYYY.M.D）从小到大排序
- 日期早的在前，晚的在后
- 严格贴合查询起止时间，无跳序/倒序
- 示例：`2026.3.5 → 2026.3.6 → 2026.3.7 → 2026.3.8 → 2026.3.9 → 2026.3.10 → 2026.3.11`

**二级排序：同一天的来源顺序**
- 证券时报 → 中国证券报 → 证券日报

**三级排序：同一来源按发布时间**
- 同一日期下的同一来源新闻，按发布时间（时/分）从小到大排序
- 时间早的在前，晚的在后

#### （5）无内容标注规则

若某日期某平台无符合规则的新闻，标注：
- `2026.3.7「证券时报无符合规则新闻」`
- `2026.3.7「中国证券报无符合规则新闻」`
- `2026.3.7「证券日报无符合规则新闻」`

### 四、完整排版示例

```
2026.3.2

• 全市场ETF突破1400只，易方达122只数量居首。Wind数据显示，截至2026年2月末，全市场已成立ETF共计1446只。其中，易方达基金旗下ETF数量达122只，数量居全市场第一...
http://www.stcn.com/article/detail/XXXXXXX.html
中证金牛座，全市场ETF突破1400只，易方达122只数量居首 中证金牛座

• 多只场内原油主题基金提示风险。受近期国际油价上涨影响，3月2日，多只场内原油主题基金溢价率集体飙升...
http://www.cs.com.cn/tzjj/jjdt/202603/t20260302_XXXXXXX.html
中证金牛座，溢价集体飙升！多只场内原油主题基金提示风险 中证金牛座

2026.3.3

• 油气与黄金两大主题ETF集体大涨 机构密集提示溢价风险。3月2日，油气、黄金两大资源主题ETF开盘即全线走强...
http://www.zqrb.cn/fund/jijindongtai/2026-03-03/AXXXXXXXX.html
证券日报，油气与黄金两大主题ETF集体大涨 机构密集提示溢价风险 证券日报
```

### 五、Word生成实现方法

使用 Python 的 `python-docx` 库生成 Word 文档：

```python
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

def generate_word_document(news_data, start_date, end_date, output_path):
    """
    生成基金新闻Word文档

    参数:
        news_data: 按日期分组的新闻数据 {日期: [{title, content, url, source}, ...]}
        start_date: 起始日期 (datetime对象)
        end_date: 截止日期 (datetime对象)
        output_path: 输出文件路径
    """
    doc = Document()

    # 按日期顺序遍历
    for date_str in sorted(news_data.keys()):
        # 日期分组段落
        date_para = doc.add_paragraph(date_str)  # 格式: 2026.3.2
        date_para.alignment = WD_ALIGN_PARAGRAPH.LEFT

        # 空行
        doc.add_paragraph()

        # 该日期下的每条新闻
        for news in news_data[date_str]:
            # 段落1: 新闻正文段（加粗）
            content_para = doc.add_paragraph(style='List Bullet')
            content_para.add_run(f"{news['title']}。{news['content']}").bold = True

            # 段落2: 原始网页链接段
            link_para = doc.add_paragraph(news['url'])

            # 段落3: 来源信息段
            source_para = doc.add_paragraph(f"{news['source']}，{news['title']} {news['source']}")

            # 新闻之间空行
            doc.add_paragraph()

    # 保存文档
    doc.save(output_path)
    return output_path
```

### 六、执行流程

1. **用户发起请求**：包含「过去七天」或「日期范围」关键词
2. **确认查询类型**：
   - 若为「过去七天」→ 计算日期范围（当日倒推6天至当日）
   - 若为「指定日期范围」→ 解析用户提供的日期区间
3. **抓取新闻数据**：按日期范围抓取三大平台新闻
4. **过滤与排序**：应用内容筛选规则，按日期分组
5. **生成Word文档**：
   - 若无符合要求的新闻 → 提示「该时间段无有效基金新闻」，不生成空文档
   - 若有新闻 → 按范本格式生成Word文档
6. **输出结果**：明确提示Word文档的保存路径

### 七、输出要求

- **成功时**：`Word文档已生成：{完整路径}`
- **无新闻时**：`该时间段无有效基金新闻`
- **路径格式**：使用 OpenClaw 可访问的绝对路径，如 `/root/.openclaw/workspace/20260302-20260306基金新闻.docx`

---

**此技能自包含完整功能，无需依赖其他技能。**
