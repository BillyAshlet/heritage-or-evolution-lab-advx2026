# SKMB-2026-07-24-002: Four-Phase Round Controller

- status: accepted
- decided_by: designer
- approval_source: `ARCHITECTURE.md` 被项目明确指定为唯一宪法，§1.2、§2.4 与 §5.4 明确给出阶段、lineage 和展台重开规则
- date: 2026-07-24
- commit: pending
- patterns:
  - B_state_persistence
  - F_fail_semantics
- scope: Four-phase round controller

## Decision

实现四个且仅四个回合阶段：

`TUNING → RUNNING → VERDICT → INHERIT`

进入下一局由调用方显式触发，控制器不自行猜测 L3 终态。展台重开可以
从任意阶段回到 L1/TUNING，并清空当前运行态与内存 lineage。

GenerationRecord 只能按代数递增追加。当前 lineage 只存在于本次运行
内，不写入磁盘。

## Applies To

- `GamePhase`
- `GameController`
- `Lineage`
- `RoundReport`
- 四个转换入口及非法转换拒绝

## Rationale

这些行为在项目宪法中已经明确；失败后的推进、耦合参数归因及 L3 最终
终态没有明确，因此本决策明确排除它们。

## Alternatives

- 节点式状态机
- 自动定时跨阶段
- 把 L3 结束隐式循环回 L1

## Supersedes

None.

## Superseded By

None.

