"""三参数玩家空间探索。

目的：验证 speed / size / stamina 三个滑块能否产生
  (a) 有区分度的结局（不是所有选择都一样）
  (b) 没有支配策略（不存在一个配置在三关全赢）
  (c) 每关至少两条活路，且它们欠的"债"不同

用法: python3 tools/trait_space.py
"""
import math
import itertools

# ---- 与 experiment-config.js 对齐的常量 ----
K = 1.35
# 当前仓库的规则：只有下界 k，没有上界（KMax 已被移除）。
# USE_KMAX=True 时启用上界窗口；K_MAX = 2.25/K 让"能吃"与"被吃"完全重合。
USE_KMAX = False
K_MAX = 2.25 / K
BASE_SIZE = {"small": 1.0, "medium": 1.5, "large": 2.25}
BASAL_RATE = 0.02
BASAL_EXP = 0.75
BURST_RATE = 0.035
ENERGY_CAP = 2 / 3
BASE_CRUISE = 0.23
BASE_TURN = 2.8
BUDGET = 150  # speed + size + stamina 的共享预算


def octave(axis, oct_):
    return 2.0 ** (axis * oct_)


def phenotype(speed, size, stamina):
    """三个 0..100 的玩家参数 → 底层表型。"""
    sa = (size / 100) * 2 - 1
    va = (speed / 100) * 2 - 1
    ta = (stamina / 100) * 2 - 1
    body = BASE_SIZE["medium"] * octave(sa, 0.45)
    return {
        "size": body,
        # 大 → 慢、笨（Kleiber + 流体阻力）
        "cruise": BASE_CRUISE * octave(va, 0.5) * octave(sa, -0.2),
        "turn": BASE_TURN * octave(va, 0.15) * octave(sa, -0.55),
        # 耐力提高容量、降低代谢
        "capacity": ENERGY_CAP * octave(ta, 0.5),
        "basal": BASAL_RATE / (body ** BASAL_EXP) * octave(ta, -0.4),
        "burst": BURST_RATE / (body ** BASAL_EXP) * octave(ta, -0.4),
        # 耐力【不】提升觅食。否则"跳出食物链 + 堆耐力"就是支配策略：
        # 离开食物链必须真的等于断粮。
        "graze": 0.25,
    }


def relation(a, b):
    """a 对 b 的关系。"""
    r = a / b
    if USE_KMAX:
        if K <= r <= K_MAX:
            return "pursuit"
        if 1 / K_MAX <= r <= 1 / K:
            return "evade"
        if 1 / K < r < K:
            return "peer"
        return "ignore"
    # 仓库当前规则：纯阈值，无上界
    if r >= K:
        return "pursuit"
    if r <= 1 / K:
        return "evade"
    return "peer"


def simulate(pheno, env, seconds=90.0, dt=0.5):
    """极简生态：玩家鱼群在给定环境下的存活率。

    env: dict(prey_density, predator_density, plankton, chase_difficulty)
    """
    n = 100.0
    energy = pheno["capacity"] * 0.82
    can_eat_prey = relation(pheno["size"], BASE_SIZE["small"]) == "pursuit"
    hunted = relation(pheno["size"], BASE_SIZE["large"]) == "evade"

    # 追击成功率：速度和转向都要够
    speed_edge = pheno["cruise"] / BASE_CRUISE
    agility = pheno["turn"] / BASE_TURN
    catch_p = min(0.95, max(0.0, 0.5 * speed_edge + 0.3 * agility - 0.35))
    catch_p *= env["chase_difficulty"]
    # 逃脱成功率：同样吃速度和灵活
    escape_p = min(0.98, 0.35 + 0.35 * speed_edge + 0.2 * agility)

    t = 0.0
    while t < seconds and n > 1:
        bursting = can_eat_prey and energy > pheno["capacity"] / 3
        drain = pheno["basal"] + (pheno["burst"] if bursting else 0.0)
        energy -= drain * dt

        # 进食
        gain = 0.0
        if can_eat_prey and bursting:
            gain += catch_p * env["prey_density"] * 0.45 * dt
        gain += pheno["graze"] * env["plankton"] * 0.030 * dt  # 中群靠浮游【撑不住】，必须捕食
        energy = min(pheno["capacity"], energy + gain)

        # 饿死
        if energy <= 0:
            n *= math.exp(-0.8 * dt)
            energy = 0.0

        # 被捕食
        if hunted:
            pressure = env["predator_density"] * (1 - escape_p)
            n *= math.exp(-pressure * 0.05 * dt)

        t += dt

    return max(0.0, n) / 100.0


# 三关环境：匮乏 → 黄金 → 下行
LEVELS = [
    ("L1 饥荒", dict(prey_density=0.25, predator_density=0.5,
                     plankton=0.35, chase_difficulty=0.7)),
    ("L2 黄金", dict(prey_density=1.0, predator_density=0.6,
                     plankton=1.0, chase_difficulty=1.0)),
    ("L3 下行", dict(prey_density=0.45, predator_density=1.6,
                     plankton=0.5, chase_difficulty=0.85)),
]


def simplex(step=10):
    """在 speed+size+stamina = BUDGET 的单纯形上取样。"""
    out = []
    for sp in range(0, 101, step):
        for sz in range(0, 101, step):
            st = BUDGET - sp - sz
            if 0 <= st <= 100:
                out.append((sp, sz, st))
    return out


def report():
    pts = simplex()
    print(f"单纯形采样点: {len(pts)}  (speed+size+stamina = {BUDGET})\n")

    results = {}
    for p in pts:
        ph = phenotype(*p)
        results[p] = [simulate(ph, env) for _, env in LEVELS]

    # 每关的最优解
    print("=== 每关最优配置 ===")
    print("关卡        speed size stamina   体型   存活率   吃小鱼 被大鱼吃")
    winners = []
    for i, (name, _) in enumerate(LEVELS):
        best = max(results, key=lambda k: results[k][i])
        ph = phenotype(*best)
        winners.append(best)
        print(f"{name:10} {best[0]:5} {best[1]:4} {best[2]:7}  "
              f"{ph['size']:5.2f}  {results[best][i]*100:6.1f}%   "
              f"{'是' if relation(ph['size'],1.0)=='pursuit' else '否':^6}"
              f"{'是' if relation(ph['size'],2.25)=='evade' else '否':^8}")

    print(f"\n三关最优解是否相同: "
          f"{'❌ 存在支配策略' if len(set(winners)) == 1 else '✅ 各关最优不同'}")

    # 是否存在三关全能的配置
    print("\n=== 支配策略检查（三关都进前 20%）===")
    ranks = []
    for i in range(len(LEVELS)):
        order = sorted(results, key=lambda k: -results[k][i])
        top = set(order[: max(1, len(order) // 5)])
        ranks.append(top)
    dominant = ranks[0] & ranks[1] & ranks[2]
    if dominant:
        print(f"❌ {len(dominant)} 个配置三关都进前 20%，例如 {sorted(dominant)[:3]}")
    else:
        print("✅ 没有任何配置能三关都进前 20% —— 必须做取舍")

    # 每关有几条活路（存活率 > 50%）
    print("\n=== 每关的活路数量（存活率 > 50%）===")
    for i, (name, _) in enumerate(LEVELS):
        alive = [k for k in results if results[k][i] > 0.5]
        if not alive:
            print(f"{name}: ❌ 无解")
            continue
        sizes = [phenotype(*k)["size"] for k in alive]
        print(f"{name}: {len(alive):3} 条  体型区间 "
              f"[{min(sizes):.2f}, {max(sizes):.2f}]")

    # 体型窗口的断崖
    print("\n=== 体型窗口断崖（玩家最该感知的取舍）===")
    print("体型    对小鱼   对大鱼")
    for sz in [0, 20, 35, 50, 65, 80, 100]:
        body = phenotype(50, sz, 50)["size"]
        print(f"{body:5.2f}   {relation(body, 1.0):8} {relation(2.25, body):8}"
              f"   (size 滑块 {sz})")


def main():
    global USE_KMAX
    for mode in (False, True):
        USE_KMAX = mode
        print("=" * 62)
        print("规则: " + ("尺寸窗口 [k, K_MAX]（K×K_MAX=2.25）"
                          if mode else "纯阈值 ratio≥k（仓库当前）"))
        print("=" * 62)
        report()
        print()


if __name__ == "__main__":
    main()
