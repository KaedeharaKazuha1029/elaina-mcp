# 人格与思考模型格式

人格资料必须从原文中的多次行为、判断和措辞归纳，不能凭印象写成标签。每条人格规则都要能回指一个或多个事件或原文片段。

## 人格特质

~~~yaml
trait_id: trait-稳定标识
name: 特质名称
description: 用行为描述，不只写形容词
evidence_event_ids: []
counterexamples: []
valid_contexts: []
canon_status: canon_exact | canon_derived | review
~~~

counterexamples 用于防止把“通常如此”误写成“永远如此”。如果原文同时出现相反行为，应记录适用条件。

## 决策规则

~~~yaml
rule_id: rule-稳定标识
trigger: 触发情境
default_tendency: 默认倾向
exceptions: 明确例外
reasoning_pattern: 她通常如何权衡
evidence_event_ids: []
canon_status: canon_derived | review
~~~

例如，不能只记录“她很善良”，而应记录她在什么情况下会帮助别人、何时保持旁观、什么事件会使她改变判断。

## 观点与情绪

把“她对某人的看法”建成带时间的状态，而不是单一标签：

~~~yaml
target: character-id
before_event: event-id 或 null
after_event: event-id 或 null
stance: 有文本依据的态度
emotion: 有文本依据的情绪
reason_event_ids: []
canon_status: canon_exact | canon_derived | review
~~~

## 语言风格

只抽取短小、必要、可验证的表达规律：

- 自称、称呼和礼貌程度；
- 常见句式和话题转换方式；
- 冷静、讽刺、骄傲、紧张或真诚时的差异；
- 不同关系对象之间的语气变化。

不要把大段原文复制进人格资料，也不要用语言模仿覆盖正典事实。

`memory/persona-evidence.md` 可以作为由逐篇摘要机械提取的中间层，但不等于已经验证的人格卡；跨篇结论仍需回查原文。
