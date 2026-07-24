# State Machine Knowledge Base

本目录记录会影响游戏状态、失败语义、继承与平台边界的设计决策。
只有 `status: accepted` 且包含明确批准来源的决策可以驱动实现。

## Decision Index

| id | status | scope | patterns | file | commit |
| --- | --- | --- | --- | --- | --- |
| SKMB-2026-07-24-001 | accepted | Android / PICO platform route | D | decisions/2026-07-24-001-android-pico-route.md | pending |
| SKMB-2026-07-24-002 | accepted | Four-phase round controller | B, F | decisions/2026-07-24-002-four-phase-round-controller.md | pending |

## Named States

| state | meaning | owner | notes | source |
| --- | --- | --- | --- | --- |
| TUNING | 玩家调整本局允许修改的特征 | GameController | 参数尚未提交 | ARCHITECTURE.md §1.2 |
| RUNNING | 参数锁死，模拟按时间推进 | GameController | 可调整演算速度 | ARCHITECTURE.md §1.2 |
| VERDICT | 展示胜负、文案与真实死因统计 | GameController | 不决定失败后的下一步 | ARCHITECTURE.md §1.2 |
| INHERIT | 封存本局记录，形成下一局遗产 | GameController | L3 后终态仍待决定 | ARCHITECTURE.md §1.2 |

## Transition Decisions

| id | from_state | event | to_state | actions | source |
| --- | --- | --- | --- | --- | --- |
| TRANSITION-001 | TUNING | start_round | RUNNING | 锁定参数并开始模拟 | ARCHITECTURE.md §1.2 |
| TRANSITION-002 | RUNNING | finish_round | VERDICT | 冻结 RoundReport | ARCHITECTURE.md §1.2 |
| TRANSITION-003 | VERDICT | seal_generation | INHERIT | append GenerationRecord | ARCHITECTURE.md §1.2, §2.4 |
| TRANSITION-004 | INHERIT | advance_round | TUNING | 进入调用方指定的下一局 | ARCHITECTURE.md §1.2 |
| TRANSITION-005 | any | restart_exhibit | TUNING | 清空运行态与 lineage，回到 L1 | ARCHITECTURE.md §5.4 |

## Invariants

| id | invariant | source |
| --- | --- | --- |
| PLATFORM-001 | 普通屏幕流程不依赖 XR；PICO/OpenXR 可整体拔除 | ARCHITECTURE.md §2.5 |
| LINEAGE-001 | GenerationRecord 只允许按 gen 递增追加，不提供回滚或删除 API | ARCHITECTURE.md §2.4 |
| REPORT-001 | survivors + deaths.eaten + deaths.starved = initial | ARCHITECTURE.md §2.3 |

## Fail Semantics

| id | context | behavior | source |
| --- | --- | --- | --- |

## Statistical Defaults Allowed Temporarily

| id | pattern | context | default | reason_allowed | review_by | file |
| --- | --- | --- | --- | --- | --- | --- |

## Open Decisions

| id | pattern | context | needed_before | file |
| --- | --- | --- | --- | --- |
| OPEN-001 | F | 一局失败后是否继续封代、重试或终止 | 实现失败路径与三局全流程 | pending |
| OPEN-002 | B/F | 耦合变化与玩家直接操作如何进入遗产锁 | 实现 `changed` 与锁表 | pending |
| OPEN-003 | F | L3 结束后的终态与展台重开行为 | 实现最终结算与重开 | pending |
