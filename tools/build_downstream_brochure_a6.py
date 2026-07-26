#!/usr/bin/env python3
"""Build the A6 finished-size Downstream booklet on two duplex A5 sheets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf._page import PageObject
from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A5, A6, landscape
from reportlab.pdfgen import canvas

import build_downstream_brochure as base


ROOT = Path(__file__).resolve().parents[1]
PDF_OUT = ROOT / "output" / "pdf"
READING_PDF = PDF_OUT / "downstream-brochure-reading-a6.pdf"
PRINT_PDF = PDF_OUT / "downstream-brochure-print-a5-duplex.pdf"

W, H = map(float, A6)


def footer(c: canvas.Canvas, page: int, dark: bool = False) -> None:
    color = (
        base.DIM_ON_DARK
        if dark
        else Color(15 / 255, 14 / 255, 12 / 255, alpha=0.5)
    )
    c.setStrokeColor(base.RULE_ON_DARK if dark else base.RULE_ON_LIGHT)
    c.setLineWidth(0.35)
    c.line(22, 19, W - 22, 19)
    c.setFillColor(color)
    c.setFont("HelveticaNeue", 4.4)
    c.drawString(22, 9, "DOWNSTREAM / EXHIBITION DOSSIER")
    c.drawRightString(W - 22, 9, f"{page:02d}")


def draw_spread_image(c: canvas.Canvas, image_path: Path, left_half: bool) -> None:
    with Image.open(image_path) as im:
        iw, ih = im.size
    spread_w = 2 * W
    scale = max(spread_w / iw, H / ih)
    dw, dh = iw * scale, ih * scale
    full_x = (spread_w - dw) / 2
    full_y = (H - dh) / 2
    offset = 0 if left_half else W
    c.drawImage(
        str(image_path),
        full_x - offset,
        full_y,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )


def cover(c: canvas.Canvas) -> None:
    c.setFillColor(base.INK)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    base.fit_crop(c, base.COVER, 0, 0, W, H)
    c.saveState()
    c.setFillAlpha(0.86)
    c.setFillColor(base.INK)
    c.rect(0, H - 112, W, 112, stroke=0, fill=1)
    c.restoreState()
    base.small_caps(c, "ADVENTUREX 2026 · INTERACTIVE INSTALLATION", 22, H - 25, base.PAPER, 4.8)
    c.setFillColor(base.PAPER)
    c.setFont("HeitiMedium", 31)
    c.drawString(21, H - 66, "下游")
    c.setFont("HelveticaNeue", 12)
    c.drawString(22, H - 87, "DOWNSTREAM")
    c.setStrokeColor(base.AMBER)
    c.setLineWidth(0.9)
    c.line(22, H - 98, 94, H - 98)
    c.setFillColor(base.PAPER)
    c.setFont("Songti", 9)
    c.drawString(22, 37, "逝者如斯——")
    c.setFont("HeitiLight", 6.7)
    c.drawString(22, 24, "彼时的最优解，或是下一代的桎梏。")


def intro(c: canvas.Canvas) -> None:
    c.setFillColor(base.PAPER_LIGHT)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    draw_spread_image(c, base.INTRO_CONCEPT, True)
    c.saveState()
    c.setFillAlpha(0.82)
    c.setFillColor(base.PAPER_LIGHT)
    c.roundRect(16, 204, W - 32, 192, 3, stroke=0, fill=1)
    c.restoreState()
    base.small_caps(c, "PROLOGUE / 引子", 22, H - 24)
    c.setFillColor(base.INK)
    c.setFont("Songti", 19)
    c.drawString(22, H - 57, "这不是不可理喻吗？")
    c.setFillColor(base.AMBER)
    c.setFont("HeitiMedium", 5.4)
    c.drawString(22, H - 82, "01 / SCARCITY · 匮乏留下的身体记忆")
    base.draw_wrapped(
        c,
        "老太太仍把纸箱和塑料瓶带回家。把需求压到最低，曾经真的救过命。",
        22,
        H - 101,
        W - 44,
        "HeitiLight",
        7.2,
        12,
        base.INK,
    )
    c.setFillColor(base.AMBER)
    c.setFont("HeitiMedium", 5.4)
    c.drawString(22, H - 148, "02 / EXPANSION · 上升期留下的信念")
    base.draw_wrapped(
        c,
        "长辈相信胆大、肯干就会赢。努力与回报，曾被一个高速上升的时代反复验证。",
        22,
        H - 167,
        W - 44,
        "HeitiLight",
        7.2,
        12,
        base.INK,
    )
    c.saveState()
    c.setFillAlpha(0.84)
    c.setFillColor(base.INK)
    c.roundRect(18, 35, W - 36, 98, 3, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(base.PAPER)
    c.setFont("HeitiMedium", 9)
    c.drawString(29, 109, "都不是。")
    base.draw_wrapped(
        c,
        "他们没有错。只是他们身体里住着的那个时代，已经不在了——而他们把那个时代的生存策略，原封不动地递给了你。",
        29,
        89,
        W - 58,
        "HeitiLight",
        6.6,
        11,
        base.PAPER,
    )
    footer(c, 2)


def concept(c: canvas.Canvas) -> None:
    c.setFillColor(base.PAPER_LIGHT)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    draw_spread_image(c, base.INTRO_CONCEPT, False)
    c.saveState()
    c.setFillAlpha(0.84)
    c.setFillColor(base.PAPER_LIGHT)
    c.roundRect(16, 180, 134, 216, 3, stroke=0, fill=1)
    c.restoreState()
    base.small_caps(c, "HABITUS / 惯习与继承", 22, H - 24)
    c.setFillColor(base.INK)
    c.setFont("Songti", 17)
    c.drawString(22, H - 56, "历史如何变成本能？")
    steps = [
        (
            "01 / 惯习",
            "有效策略被身体内化为倾向：还没有思考，动作已经先发生。",
        ),
        (
            "02 / 取舍",
            "速度、体型、耐力真实此消彼长；没有“全都要”的位置。",
        ),
        (
            "03 / 继承",
            "本代系数与历史逐项相乘。上一代压缩的方向，下一代要付出更高代价才能扳回。",
        ),
    ]
    y = H - 84
    for label, body in steps:
        c.setFillColor(base.AMBER)
        c.setFont("HeitiMedium", 5.4)
        c.drawString(22, y, label)
        y = base.draw_wrapped(
            c, body, 22, y - 15, 116, "HeitiLight", 6.5, 10.5, base.INK
        )
        y -= 12
    c.setFillColor(base.AMBER)
    c.setFont("HeitiMedium", 5.8)
    c.drawCentredString(220, 339, "速度")
    c.drawString(171, 224, "体型")
    c.drawRightString(279, 224, "耐力")
    c.saveState()
    c.setFillAlpha(0.85)
    c.setFillColor(base.INK)
    c.roundRect(18, 35, W - 36, 111, 3, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(base.AMBER)
    c.setFont("HelveticaNeue", 5.2)
    c.drawString(29, 122, "GEN 01 × GEN 02 × GEN 03")
    c.setFillColor(base.PAPER)
    c.setFont("HeitiMedium", 8.2)
    c.drawString(29, 97, "你调节的不是这一代的鱼，")
    c.drawString(29, 82, "而是下一代还能怎样调节自己的余地。")
    c.setFillColor(base.DIM_ON_DARK)
    c.setFont("HeitiLight", 6)
    c.drawString(29, 58, "每一步都合理。反噬不来自愚蠢，来自时间。")
    footer(c, 3)


def generation_left(c: canvas.Canvas) -> None:
    c.setFillColor(base.INK)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    draw_spread_image(c, base.ERAS, True)
    c.saveState()
    c.setFillAlpha(0.63)
    c.setFillColor(base.INK)
    c.rect(0, H - 69, W, 69, stroke=0, fill=1)
    c.roundRect(17, 37, W - 34, 82, 3, stroke=0, fill=1)
    c.restoreState()
    base.small_caps(c, "THREE GENERATIONS / 三代", 22, H - 23, base.PAPER)
    c.setFillColor(base.PAPER)
    c.setFont("Songti", 18)
    c.drawString(22, H - 50, "一 · 不周山")
    c.setFillColor(base.AMBER)
    c.setFont("HelveticaNeue", 5)
    c.drawString(22, H - 64, "SCARCITY / 活下来就是胜利")
    base.draw_wrapped(
        c,
        "捕食者环伺，物资匮乏。减小体型，把余量押给耐力或速度，是当时无可指摘的最优解。",
        28,
        94,
        W - 56,
        "HeitiLight",
        6.6,
        11,
        base.PAPER,
    )
    footer(c, 4, True)


def generation_right(c: canvas.Canvas) -> None:
    c.setFillColor(base.INK)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    draw_spread_image(c, base.ERAS, False)
    c.saveState()
    c.setFillAlpha(0.76)
    c.setFillColor(base.INK)
    c.rect(0, H - 69, W, 69, stroke=0, fill=1)
    c.roundRect(17, 149, W - 34, 76, 3, stroke=0, fill=1)
    c.roundRect(17, 37, W - 34, 94, 3, stroke=0, fill=1)
    c.restoreState()
    base.small_caps(c, "THREE GENERATIONS / 三代", 22, H - 23, base.PAPER)
    c.setFillColor(base.PAPER)
    c.setFont("Songti", 15)
    c.drawString(22, H - 49, "二 · 黄金时代")
    c.setFillColor(base.AMBER)
    c.setFont("HelveticaNeue", 4.8)
    c.drawString(22, H - 63, "EXPANSION / 胆大者赢")
    base.draw_wrapped(
        c,
        "扩张成为新的及格线。鱼开始捕食昨天还与自己平行的对手；账单却记在了下一代名下。",
        28,
        204,
        W - 56,
        "HeitiLight",
        6.2,
        10.5,
        base.PAPER,
    )
    c.setFillColor(base.PAPER)
    c.setFont("Songti", 13)
    c.drawString(28, 108, "三 · 东海车辙")
    c.setFillColor(base.AMBER)
    c.setFont("HelveticaNeue", 4.7)
    c.drawString(28, 93, "STAGNATION / 休息成为生存策略")
    base.draw_wrapped(
        c,
        "水体降温，正解是增加耐力、降低代谢。但历代取舍让旧邻居变成了捕食者。",
        28,
        76,
        W - 56,
        "HeitiLight",
        6.1,
        10,
        base.PAPER,
    )
    footer(c, 5, True)


def simulation(c: canvas.Canvas) -> None:
    c.setFillColor(base.PAPER_LIGHT)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    base.small_caps(c, "BENEATH THE SURFACE / 水面之下", 22, H - 24)
    c.setFillColor(base.INK)
    c.setFont("Songti", 18)
    c.drawString(22, H - 56, "鱼不是动画，是模拟。")
    base.draw_wrapped(
        c,
        "没有全局导航，没有上帝视角；群体性格从千万次局部互动中涌现。",
        22,
        H - 79,
        W - 44,
        "HeitiLight",
        6.7,
        11,
        base.INK,
    )
    nodes = [
        ("01", "分离 / 对齐 / 凝聚", "经典 Boids 三力让群体自发形成。", 270),
        ("02", "两层捕猎力", "远处被鱼群吸引，近处锁定并冲刺。", 218),
        ("03", "恐慌的社会传播", "警报沿邻居网络扩散、衰减并平息。", 166),
        ("04", "局部感知", "半径之外，捕食者只是一条普通的鱼。", 114),
    ]
    for num, title, body, y in nodes:
        c.setStrokeColor(base.RULE_ON_LIGHT)
        c.line(42, y, W - 22, y)
        c.setFillColor(base.AMBER)
        c.circle(30, y, 8, stroke=0, fill=1)
        c.setFillColor(base.INK)
        c.setFont("HelveticaNeue", 4.5)
        c.drawCentredString(30, y - 1.6, num)
        c.setFont("HeitiMedium", 7)
        c.drawString(50, y + 5, title)
        c.setFont("HeitiLight", 5.8)
        c.setFillColor(Color(15 / 255, 14 / 255, 12 / 255, alpha=0.65))
        c.drawString(50, y - 10, body)
    c.setFillColor(base.INK)
    c.rect(22, 37, W - 44, 45, stroke=0, fill=1)
    c.setFillColor(base.PAPER)
    c.setFont("HeitiMedium", 6.5)
    c.drawString(31, 63, "红线：死因必须来自真实模拟。")
    c.setFillColor(base.DIM_ON_DARK)
    c.setFont("HeitiLight", 5.4)
    c.drawString(31, 48, "追逐、恐慌与力竭真实发生，因果不是编出来的。")
    footer(c, 6)


def philosophy(c: canvas.Canvas) -> None:
    c.setFillColor(base.INK)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    base.small_caps(c, "THE DEBT OF REST / 休息的债", 22, H - 24, base.PAPER)
    c.setFillColor(base.PAPER)
    c.setFont("Songti", 16)
    c.drawString(22, H - 56, "越完美地适应一个时代，")
    c.drawString(22, H - 78, "越可能过拟合于一个消失的世界。")
    concepts = [
        ("HABITUS / 惯习", "过去被身体记住，成为尚未思考就已发生的选择。"),
        ("PATH DEPENDENCE / 路径依赖", "早期取舍经由连乘自我锁定，后代无法回到白纸。"),
        ("ANTIFRAGILITY / 反脆弱", "对单一环境的极致优化，就是对变化的极致脆弱。"),
    ]
    y = 292
    for label, body in concepts:
        c.setStrokeColor(base.AMBER)
        c.setLineWidth(0.55)
        c.line(22, y, 57, y)
        c.setFillColor(base.AMBER)
        c.setFont("HelveticaNeue", 5.1)
        c.drawString(68, y - 1.5, label)
        base.draw_wrapped(
            c, body, 68, y - 18, W - 90, "HeitiLight", 6, 10, base.PAPER
        )
        y -= 68
    c.setStrokeColor(base.AMBER)
    c.line(22, 76, W - 22, 76)
    c.setFillColor(base.PAPER)
    c.setFont("HeitiMedium", 7.6)
    c.drawString(22, 57, "在东海车辙里，休息本身就是生存策略。")
    c.setFillColor(base.DIM_ON_DARK)
    c.setFont("HeitiLight", 5.6)
    c.drawString(22, 41, "恢复力不是可以永远向下游赊账的资源。")
    footer(c, 7, True)


def back(c: canvas.Canvas) -> None:
    c.setFillColor(base.PAPER_LIGHT)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    base.small_caps(c, "JOIN THE EXPERIMENT / 加入实验", 22, H - 24)
    c.setFillColor(base.INK)
    c.setFont("Songti", 17)
    c.drawString(22, H - 54, "亲手做一次“上游”。")
    c.setFont("HeitiLight", 6.3)
    c.drawString(22, H - 75, "选择三代进化方向，然后站在下游，看决定如何流向未来。")

    qr_size = 105
    qr_x, qr_y = 22, 255
    c.setFillColor(base.WHITE)
    c.roundRect(qr_x - 5, qr_y - 5, qr_size + 10, qr_size + 10, 2, stroke=0, fill=1)
    c.drawImage(
        str(base.QR_CROP),
        qr_x,
        qr_y,
        qr_size,
        qr_size,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.setFillColor(base.INK)
    c.setFont("HeitiMedium", 5.8)
    c.drawCentredString(qr_x + qr_size / 2, 241, "下游 downstream 玩家用户体验群")
    c.setFillColor(Color(15 / 255, 14 / 255, 12 / 255, alpha=0.52))
    c.setFont("HeitiLight", 4.8)
    c.drawCentredString(qr_x + qr_size / 2, 229, "入群码有效期至 8/2 · 入群后将更新")

    c.setFillColor(base.AMBER)
    c.setFont("HelveticaNeue", 5.4)
    c.drawString(149, 329, "TEMPORARY DOMAIN")
    c.setFillColor(base.INK)
    c.setFont("HelveticaNeue", 10)
    c.drawString(149, 309, "advx.billyashlet.com")
    c.setFillColor(Color(15 / 255, 14 / 255, 12 / 255, alpha=0.62))
    c.setFont("HeitiLight", 5.5)
    c.drawString(149, 279, "boids 算法 · 模拟进化")
    c.drawString(149, 266, "代际选择 · 休息与恢复")

    c.setStrokeColor(base.AMBER)
    c.setLineWidth(0.6)
    c.line(22, 210, W - 22, 210)
    c.setFillColor(base.AMBER)
    c.setFont("HeitiMedium", 6)
    c.drawString(22, 196, "创作团队 / CREDITS")
    credits = [
        (
            "北辰",
            "技术架构与系统工程化、WebSpatial 集成与空间端适配、底层模拟参数向玩家可玩参数的映射实现、玩法参数调优与数值平衡、开源技术调研与方案验证",
            "NorthStarXyz@proton.me",
        ),
        (
            "BillyAshlet 栀归零",
            "产品与叙事架构、概念设计、核心模拟算法的基础设计与原型实现、群体运动与物理交互规则设计及效果调校、玩法与关卡设计、UI 与视觉设计、手册设计、文献研究与理论框架的交互转译",
            "billyashlet.com",
        ),
        (
            "叁金",
            "模型形态参数化与躯体自由度系统实现、模型渲染优化、相机视锥剔除（Frustum Culling）与可见性渲染优化、3D 场景架构、渲染风格定义与规范",
            "akbptech@gmail.com",
        ),
    ]
    y = 178
    for name, role, contact in credits:
        c.setFillColor(base.INK)
        c.setFont("HeitiMedium", 6.3)
        c.drawString(22, y, name)
        role_y = base.draw_wrapped(
            c, role, 79, y, W - 101, "HeitiLight", 5.1, 7.2, base.INK
        )
        c.setFillColor(base.AMBER)
        c.setFont("HelveticaNeue", 4.8)
        c.drawString(22, y - 11, contact)
        y = min(y - 48, role_y - 13)
    footer(c, 8)


def build_reading_pdf() -> None:
    c = canvas.Canvas(str(READING_PDF), pagesize=A6, pageCompression=1)
    c.setTitle("下游 / Downstream - A6 展览宣传册")
    c.setAuthor("Downstream / AdventureX 2026")
    c.setSubject("关于代际继承、路径依赖与休息之债的叙事交互装置")
    for draw in (
        cover,
        intro,
        concept,
        generation_left,
        generation_right,
        simulation,
        philosophy,
        back,
    ):
        draw(c)
        c.showPage()
    c.save()


def build_print_pdf() -> None:
    reader = PdfReader(str(READING_PDF))
    page_w, page_h = map(float, A6)
    sheet_w, sheet_h = map(float, landscape(A5))
    x_margin = (sheet_w - 2 * page_w) / 2
    y_margin = (sheet_h - page_h) / 2
    pairs = [(8, 1), (2, 7), (6, 3), (4, 5)]
    writer = PdfWriter()
    for left_no, right_no in pairs:
        sheet = PageObject.create_blank_page(width=sheet_w, height=sheet_h)
        sheet.merge_transformed_page(
            reader.pages[left_no - 1], Transformation().translate(x_margin, y_margin)
        )
        sheet.merge_transformed_page(
            reader.pages[right_no - 1],
            Transformation().translate(x_margin + page_w, y_margin),
        )
        writer.add_page(sheet)
    writer.add_metadata(
        {
            "/Title": "下游 / Downstream - A5 双面骑马订拼版",
            "/Author": "Downstream / AdventureX 2026",
            "/Subject": "8 页 A6 小册的两张 A5 双面骑马订拼版",
        }
    )
    with PRINT_PDF.open("wb") as stream:
        writer.write(stream)


def main() -> None:
    PDF_OUT.mkdir(parents=True, exist_ok=True)
    base.register_fonts()
    base.crop_qr()
    build_reading_pdf()
    build_print_pdf()
    print(READING_PDF)
    print(PRINT_PDF)


if __name__ == "__main__":
    main()
