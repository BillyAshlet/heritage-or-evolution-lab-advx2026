"""生态系统设计搜索。

同时回答两件事：
  1. 什么样的食物链结构能【稳定】（不崩、不爆、可观赏）
  2. 在那个结构下，玩家的三个参数能不能产生【有区分度、无支配策略】的抉择

模型：营养级仓室模型 + 每级平均能量追踪。
  浮游(logistic) → 小群 → 中群(玩家) → 大群
  死亡 → 腐肉 → 被清道夫回收

编码的生态学约束：
  Kleiber   代谢 ∝ 体型^0.75
  Holling II 捕食率随猎物密度饱和（缺了它捕食者会指数爆炸）
  Lindeman  每级约 10% 能量传递效率
  体型窗口  捕食者只吃 [k, kmax] 比例带内的猎物

用法: python3 tools/ecosystem_search.py
"""
import math
import itertools

TANK_VOLUME = 51.84


# ---------------------------------------------------------------- 结构定义
class Design:
    def __init__(self, sizes, counts, k, kmax, plankton_capacity=600.0,
                 plankton_growth=0.35, attack_rate=0.12, handling=30.0,
                 trophic_efficiency=0.9, basal=0.02, basal_exp=0.75,
                 graze_rate=(1.0, 0.25, 0.0), carrion_decay=0.02,
                 plankton_conversion=0.5, recruit_rate=0.0, carry=None):
        # 标定依据：Holling II 的饱和上限 = 1/handling。
        #   handling=30 → 每条捕食者最多 0.033 猎物/秒 ≈ 30 秒吃一条。
        #   原来 handling=2.5 给出 0.4/秒，200 条中鱼每秒吃掉 75 条小鱼，
        #   小群 5 秒清空 —— 那不是生态，是绞肉机。
        self.sizes = sizes                 # (小, 中, 大) 体型
        self.counts = counts               # 初始数量
        self.k = k                         # 捕食体型比下界
        self.kmax = kmax                   # 上界；None = 无上界
        self.pk = plankton_capacity
        self.pg = plankton_growth
        self.attack = attack_rate          # Holling 攻击率
        self.handling = handling           # Holling 处理时间（饱和的来源）
        self.eff = trophic_efficiency      # 营养级传递效率
        self.basal = basal
        self.basal_exp = basal_exp
        self.graze = graze_rate
        self.carrion_decay = carrion_decay
        self.pconv = plankton_conversion
        # 补充/繁殖：吃饱有余的个体按此速率增殖。没有它，任何捕食都会
        # 让猎物单调递减到零 —— 那不是生态，是清算。
        self.recruit = recruit_rate
        self.carry = carry or [c * 1.6 for c in counts]

    def relation(self, a, b):
        r = self.sizes[a] / self.sizes[b]
        if self.kmax is None:
            return 'pursuit' if r >= self.k else (
                'evade' if r <= 1 / self.k else 'peer')
        if self.k <= r <= self.kmax:
            return 'pursuit'
        if 1 / self.kmax <= r <= 1 / self.k:
            return 'evade'
        if 1 / self.k < r < self.k:
            return 'peer'
        return 'ignore'

    def prey_of(self, i):
        return [j for j in range(3) if j != i and self.relation(i, j) == 'pursuit']

    def metabolism(self, i, activity=1.0):
        return self.basal / (self.sizes[i] ** self.basal_exp) * activity


# ---------------------------------------------------------------- 动力学
def simulate(design, seconds=180.0, dt=0.25, player=None, record=False):
    """player = (speed_mult, size_mult, stamina_mult) 作用于中群。"""
    sizes = list(design.sizes)
    graze = list(design.graze)
    speed_mult = stamina_mult = 1.0
    if player:
        speed_mult, size_mult, stamina_mult = player
        sizes[1] *= size_mult

    d = Design(tuple(sizes), design.counts, design.k, design.kmax,
               design.pk, design.pg, design.attack, design.handling,
               design.eff, design.basal, design.basal_exp,
               tuple(graze), design.carrion_decay, design.pconv,
               design.recruit, design.carry)

    n = [float(c) for c in design.counts]
    # 耐力只降代谢，不同时加容量 —— 否则是双重加成，扛饿时间 ×2 太强
    cap = [0.667, 0.667, 0.667]
    e = [c * 0.82 for c in cap]
    plankton = d.pk * 0.8
    carrion = 0.0
    trace = []

    t = 0.0
    while t < seconds:
        density = [x / TANK_VOLUME for x in n]
        births_food = [0.0, 0.0, 0.0]
        deaths_pred = [0.0, 0.0, 0.0]

        # --- 捕食：Holling II 型功能反应 ---
        for i in range(3):
            if n[i] <= 0:
                continue
            for j in d.prey_of(i):
                if n[j] <= 0:
                    continue
                # 速度优势影响攻击率（只有玩家的中群会变）
                a = d.attack * (speed_mult if i == 1 else 1.0)
                h = d.handling
                if i == 1:
                    # 速度同时缩短【处理时间】。缺了这条，Holling 饱和会让
                    # 高猎物密度下的 intake 上限 = 1/handling 与攻击率无关，
                    # 速度就变成免费参数 —— 那正是支配策略的来源。
                    h /= max(0.4, speed_mult)
                if j == 1:
                    a /= max(0.3, speed_mult)
                intake = a * density[j] / (1 + a * h * density[j])
                eaten = intake * n[i] * dt
                eaten = min(eaten, n[j] * 0.5)
                deaths_pred[j] += eaten
                # Lindeman：猎物生物量 × 效率 → 捕食者能量
                births_food[i] += eaten * sizes[j] * d.eff

        # --- 觅食：浮游 + 腐肉 ---
        for i in range(3):
            if n[i] <= 0 or d.graze[i] <= 0:
                continue
            hunger = max(0.0, 1 - e[i] / cap[i])
            if hunger < 0.2:
                continue
            want = d.graze[i] * n[i] * 0.02 * dt * hunger
            # 腐肉优先（能量密度高）
            got_c = min(carrion, want * 0.5)
            carrion -= got_c
            got_p = min(plankton, (want - got_c * 0.5) * 2.0)
            plankton -= got_p
            births_food[i] += got_c * 0.5 + got_p * d.pconv

        # --- 浮游再生（logistic）---
        plankton += d.pg * plankton * (1 - plankton / d.pk) * dt
        plankton = max(d.pk * 0.01, min(d.pk, plankton))
        carrion *= math.exp(-d.carrion_decay * dt)

        # --- 能量收支与饿死 ---
        deaths_starve = [0.0, 0.0, 0.0]
        for i in range(3):
            if n[i] <= 0:
                continue
            active = 1.0 + (0.9 if d.prey_of(i) else 0.0)
            drain = d.metabolism(i, active)
            if i == 1:
                drain /= max(0.4, stamina_mult)
                drain *= (0.6 + 0.4 * speed_mult)
            e[i] += births_food[i] / n[i] - drain * dt
            e[i] = min(cap[i], e[i])
            if e[i] <= 0:
                # 能量见底 → 按缺口比例死亡
                deaths_starve[i] = n[i] * min(0.6, -e[i] / cap[i] * 4 + 0.05) * dt
                e[i] = 0.0

        # --- 补充：能量充裕时繁殖，受承载量限制 ---
        for i in range(3):
            if n[i] <= 0 or d.recruit <= 0:
                continue
            surplus = max(0.0, e[i] / cap[i] - 0.55)
            if surplus <= 0:
                continue
            room = max(0.0, 1 - n[i] / max(1.0, d.carry[i]))
            n[i] += d.recruit * surplus * room * n[i] * dt

        for i in range(3):
            dead = deaths_pred[i] + deaths_starve[i]
            n[i] = max(0.0, n[i] - dead)
            carrion += deaths_starve[i] * sizes[i] * 0.5

        if record and int(t / dt) % int(10 / dt) == 0:
            trace.append((round(t), [round(x) for x in n],
                          round(plankton), round(carrion, 1)))
        t += dt

    result = {
        'final': n,
        'ratio': [n[i] / design.counts[i] for i in range(3)],
        'plankton': plankton,
        'trace': trace,
    }
    return result


# ---------------------------------------------------------------- 评分
def score_stability(design):
    """结构本身好不好：三级都活、比例不崩、金字塔成立。"""
    r = simulate(design)
    ratios = r['ratio']
    if min(ratios) < 0.05:
        return -1, r          # 有物种灭绝
    if max(ratios) > 3.0:
        return -1, r          # 爆炸
    # 金字塔：数量必须 小 > 中 > 大
    if not (r['final'][0] > r['final'][1] > r['final'][2]):
        return -0.5, r
    # 越接近初值越稳，但完全不动也无聊 —— 取适度波动
    drift = sum(abs(math.log(max(x, 1e-3))) for x in ratios) / 3
    return 1.0 / (1.0 + drift), r


def player_space(design, levels, step=10):
    """扫玩家三参数（乘子形式），返回每关最优与支配策略检查。"""
    pts = []
    for sp in range(0, 101, step):
        for sz in range(0, 101, step):
            st = 150 - sp - sz
            if 0 <= st <= 100:
                pts.append((sp, sz, st))

    def to_mult(v, oct_):
        return 2.0 ** (((v / 100) * 2 - 1) * oct_)

    out = {}
    for p in pts:
        m = (to_mult(p[0], 0.5), to_mult(p[1], 0.45), to_mult(p[2], 0.5))
        out[p] = []
        for lv in levels:
            d = Design(design.sizes, lv['counts'], design.k, design.kmax,
                       lv['plankton_capacity'], design.pg, design.attack,
                       design.handling, design.eff, design.basal,
                       design.basal_exp, design.graze, design.carrion_decay,
                       design.pconv, design.recruit,
                       [c * 1.6 for c in lv['counts']])
            r = simulate(d, seconds=lv['seconds'], player=m)
            out[p].append(r['ratio'][1])       # 玩家（中群）存活率
    return out


def main():
    print('=' * 66)
    print('第一步：搜索能稳定的食物链结构')
    print('=' * 66)

    best = None
    grid = []
    for mid in [1.4, 1.5, 1.6]:
        for big in [2.1, 2.25, 2.4]:
            for kmax in [None, 2.25 / 1.35]:
                for counts in [(400, 60, 12), (400, 40, 8),
                               (500, 80, 16), (360, 90, 24)]:
                    for rec in [0.010, 0.020, 0.035]:
                        d = Design((1.0, mid, big), counts, 1.35, kmax,
                                   recruit_rate=rec)
                        sc, r = score_stability(d)
                        grid.append((sc, mid, big, kmax, counts, rec, r))
                        if best is None or sc > best[0]:
                            best = grid[-1]

    ok = [g for g in grid if g[0] > 0]
    print(f'搜索 {len(grid)} 种结构，{len(ok)} 种稳定\n')
    print('评分   中体型 大体型  KMax   初始数量       补充率  末态数量        浮游')
    for g in sorted(ok, key=lambda x: -x[0])[:8]:
        sc, mid, big, kmax, counts, rec, r = g
        km = '无' if kmax is None else f'{kmax:.3f}'
        print(f'{sc:.3f}  {mid:5}  {big:5}  {km:>6}  {str(counts):14} '
              f'{rec:.3f}  {str([round(x) for x in r["final"]]):16} '
              f'{r["plankton"]:.0f}')

    if not ok:
        print('❌ 没有稳定结构，需要放宽参数')
        return

    sc, mid, big, kmax, counts, rec, _ = sorted(ok, key=lambda x: -x[0])[0]
    print(f'\n最佳结构：体型 1.0 / {mid} / {big}，'
          f'KMax {"无" if kmax is None else round(kmax,3)}，'
          f'数量 {counts}，补充率 {rec}')

    chosen = Design((1.0, mid, big), counts, 1.35, kmax, recruit_rate=rec)
    print('\n关系矩阵：')
    names = ['小群', '中群', '大群']
    for i in range(3):
        row = '  '.join('  — ' if i == j else
                        {'pursuit': ' 追 ', 'evade': ' 逃 ',
                         'peer': '同级', 'ignore': '忽略'}[chosen.relation(i, j)]
                        for j in range(3))
        print(f'  {names[i]}   {row}')

    print('\n种群轨迹（每 10 秒）：')
    r = simulate(chosen, record=True)
    for row in r['trace'][::3]:
        print(f'  t={row[0]:3}s  小/中/大 = {row[1]}  浮游 {row[2]}  腐肉 {row[3]}')

    print('\n' + '=' * 66)
    print('第二步：玩家三参数空间')
    print('=' * 66)
    levels = [
        # 关卡建立在【稳定结构】之上，只改环境压力，不改金字塔形状
        dict(name='L1 饥荒', counts=(220, 40, 8),
             plankton_capacity=240.0, seconds=120),
        dict(name='L2 黄金', counts=(650, 40, 6),
             plankton_capacity=900.0, seconds=120),
        dict(name='L3 下行', counts=(340, 40, 13),
             plankton_capacity=460.0, seconds=120),
    ]
    res = player_space(chosen, levels)

    print('\n关卡       最优 speed/size/stamina   玩家存活率')
    winners = []
    for i, lv in enumerate(levels):
        b = max(res, key=lambda kk: res[kk][i])
        winners.append(b)
        print(f'{lv["name"]:10} {str(b):22} {res[b][i]*100:6.1f}%')

    print(f'\n各关最优是否不同: '
          f'{"✅" if len(set(winners)) > 1 else "❌ 存在支配策略"}')

    tops = []
    for i in range(3):
        order = sorted(res, key=lambda kk: -res[kk][i])
        tops.append(set(order[: max(1, len(order) // 4)]))
    dom = tops[0] & tops[1] & tops[2]
    print(f'三关都进前 25% 的配置: '
          f'{"✅ 无（必须取舍）" if not dom else f"❌ {len(dom)} 个：{sorted(dom)[:3]}"}')

    for i, lv in enumerate(levels):
        alive = [kk for kk in res if res[kk][i] > 0.5]
        print(f'{lv["name"]}: {len(alive)}/{len(res)} 条活路')


if __name__ == '__main__':
    main()
