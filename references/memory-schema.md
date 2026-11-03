# 正典记忆数据模型

记忆库不是一张平面表，而是由可回溯的事实卡、事件卡、人物卡、观点边和关系边组成。所有记录都必须保留原文或文章概括定位。

## 事件卡

```yaml
event_id: evt-稳定标识
source_path: 小说/VolXX/某篇.txt
summary_path: 文章概括/VolXX/某篇.md
chronology:
  volume: 卷号
  article_order: 篇内或卷内顺序
  relative_before: []
  relative_after: []
participants: []
location: []
trigger: 原文明确的起因
steps: []
outcome: 原文明确的结局
consequences: []
elaina_knowledge:
  observed: []
  learned_later: []
  unknown_at_the_time: []
elaina_view:
  stance: 只能写有依据的判断
  emotion: 只能写文本支持的情绪
  evidence_event_ids: []
canon_status: canon_exact | canon_derived | review
```

## 人物卡

记录人物的稳定身份、别名、出场篇目和明确行为，不把一次事件中的临时状态误写成永久性格。

## 观点边

```yaml
from: elaina
to: character-id
valid_after: event-id 或时间点
valid_before: event-id 或时间点
stance: 原文依据下的看法
reason_event_ids: []
canon_status: canon_exact | canon_derived | review
```

观点必须允许随事件变化，不能只保留一个“当前总评价”。

## 原文定位

每条重要事实至少保留 `source_path` 和章节/段落/片段定位。概括与原文冲突时，以原文为准，并把冲突标记为 `review`，不得静默覆盖。

## 文件级索引

`memory/index.sqlite3` 的 `source_map` 表保证每篇原文和其摘要的一对一映射；`documents` 保存摘要全文和原文分块，原文分块保留字符偏移，便于在摘要不足时精准回查。
