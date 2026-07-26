#!/usr/bin/env python3
"""Build the Downstream A5 exhibition booklet and A4 print imposition."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf._page import PageObject
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, A5, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "brochure"
PDF_OUT = ROOT / "output" / "pdf"
TMP = ROOT / "tmp" / "pdfs"

READING_PDF = PDF_OUT / "downstream-brochure-reading-a5.pdf"
PRINT_PDF = PDF_OUT / "downstream-brochure-print-a4-duplex.pdf"

COVER = OUT / "downstream-cover-art.png"
ERAS = OUT / "downstream-three-eras-art.png"
INTRO_CONCEPT = OUT / "downstream-intro-concept-art.png"
QR_SOURCE = OUT / "downstream-group-code-source.jpg"
QR_CROP = OUT / "downstream-group-code.png"

FONT_SANS_LIGHT = "/System/Library/Fonts/STHeiti Light.ttc"
FONT_SANS_MEDIUM = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT_LATIN = "/System/Library/Fonts/HelveticaNeue.ttc"

INK = HexColor("#0F0E0C")
PAPER = HexColor("#DDD8CC")
PAPER_LIGHT = HexColor("#EEE9DE")
AMBER = HexColor("#C4892A")
RUST = HexColor("#C96A4E")
MOSS = HexColor("#8FA65A")
WHITE = HexColor("#F5F1E8")
DIM_ON_DARK = Color(221 / 255, 216 / 255, 204 / 255, alpha=0.68)
RULE_ON_DARK = Color(221 / 255, 216 / 255, 204 / 255, alpha=0.24)
RULE_ON_LIGHT = Color(15 / 255, 14 / 255, 12 / 255, alpha=0.22)


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("HeitiLight", FONT_SANS_LIGHT, subfontIndex=0))
    pdfmetrics.registerFont(TTFont("HeitiMedium", FONT_SANS_MEDIUM, subfontIndex=0))
    pdfmetrics.registerFont(TTFont("Songti", FONT_SERIF, subfontIndex=0))
    pdfmetrics.registerFont(TTFont("HelveticaNeue", FONT_LATIN, subfontIndex=0))


def crop_qr() -> None:
    """Crop only the machine-readable code; all labels are re-typeset."""
    image = Image.open(QR_SOURCE).convert("RGB")
    # Measured against the supplied 1050 x 1602 source.
    qr = image.crop((136, 575, 920, 1378))
    # Keep hard black/white modules crisp and avoid a recompression cycle.
    qr.save(QR_CROP, "PNG", optimize=True)


def fit_crop(c: canvas.Canvas, image_path: Path, x: float, y: float, w: float, h: float) -> None:
    with Image.open(image_path) as im:
        iw, ih = im.size
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(
        str(image_path),
        x + (w - dw) / 2,
        y + (h - dh) / 2,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        line = ""
        for char in paragraph:
            trial = line + char
            if line and text_width(trial, font, size) > max_width:
                lines.append(line)
                line = char
            else:
                line = trial
        if line:
            lines.append(line)
    return lines


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font: str,
    size: float,
    leading: float,
    color,
    max_lines: int | None = None,
) -> float:
    lines = wrap_text(text, font, size, max_width)
    if max_lines is not None:
        lines = lines[:max_lines]
    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def small_caps(c: canvas.Canvas, text: str, x: float, y: float, color=AMBER, size: float = 6.5) -> None:
    c.setFillColor(color)
    c.setFont("HelveticaNeue", size)
    c.drawString(x, y, text)


def footer(c: canvas.Canvas, page: int, dark: bool = False) -> None:
    w, _ = A5
    color = DIM_ON_DARK if dark else Color(15 / 255, 14 / 255, 12 / 255, alpha=0.55)
    c.setStrokeColor(RULE_ON_DARK if dark else RULE_ON_LIGHT)
    c.setLineWidth(0.45)
    c.line(31, 24, w - 31, 24)
    c.setFillColor(color)
    c.setFont("HelveticaNeue", 5.8)
    c.drawString(31, 13, "DOWNSTREAM / EXHIBITION DOSSIER")
    c.drawRightString(w - 31, 13, f"{page:02d}")


def page_cover(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(INK)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    fit_crop(c, COVER, 0, 0, w, h)
    c.saveState()
    c.setFillAlpha(0.84)
    c.setFillColor(INK)
    c.rect(0, h - 150, w, 150, stroke=0, fill=1)
    c.restoreState()
    small_caps(c, "ADVENTUREX 2026 · INTERACTIVE INSTALLATION", 31, h - 35, PAPER, 6.2)
    c.setFillColor(PAPER)
    c.setFont("HeitiMedium", 42)
    c.drawString(29, h - 91, "下游")
    c.setFont("HelveticaNeue", 16)
    c.drawString(31, h - 116, "DOWNSTREAM")
    c.setStrokeColor(AMBER)
    c.setLineWidth(1.2)
    c.line(31, h - 131, 132, h - 131)
    c.setFillColor(PAPER)
    c.setFont("Songti", 11.5)
    c.drawString(31, 50, "逝者如斯——")
    c.setFont("HeitiLight", 8.5)
    c.drawString(31, 34, "彼时的最优解，或是下一代的桎梏。")


def page_intro(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(PAPER_LIGHT)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    draw_intro_concept_half(c, 2)
    c.saveState()
    c.setFillAlpha(0.78)
    c.setFillColor(PAPER_LIGHT)
    c.roundRect(22, h - 285, w - 44, 252, 4, stroke=0, fill=1)
    c.restoreState()
    small_caps(c, "PROLOGUE / 引子", 31, h - 35)
    c.setFillColor(INK)
    c.setFont("Songti", 25)
    c.drawString(31, h - 78, "这不是不可理喻吗？")
    c.setFont("HeitiMedium", 6.5)
    c.setFillColor(AMBER)
    c.drawString(31, h - 107, "01 / SCARCITY · 匮乏留下的身体记忆")
    draw_wrapped(
        c,
        "家里不缺钱，老太太却仍把纸箱和塑料瓶捡回阳台。三十七度的夏天，她舍不得开空调——把需求压到最低，曾经真的救过命。",
        31,
        h - 132,
        w - 62,
        "HeitiLight",
        9.3,
        15.5,
        INK,
    )
    c.setFillColor(AMBER)
    c.setFont("HeitiMedium", 6.5)
    c.drawString(31, h - 205, "02 / EXPANSION · 上升期留下的信念")
    draw_wrapped(
        c,
        "饭桌另一头，长辈说：我们那时候什么都没有，胆子大一点、肯干一点，房子车子不都有了？努力与回报，曾被一个高速上升的时代反复验证。",
        31,
        h - 230,
        w - 62,
        "HeitiLight",
        9.3,
        15.5,
        INK,
    )

    c.saveState()
    c.setFillAlpha(0.82)
    c.setFillColor(INK)
    c.roundRect(25, 47, w - 50, 120, 3, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(PAPER)
    c.setFont("HeitiMedium", 12)
    c.drawString(39, 139, "都不是。")
    draw_wrapped(
        c,
        "他们没有错。只是他们身体里住着的那个时代，已经不在了——而他们把那个时代的生存策略，原封不动地递给了你。",
        39,
        114,
        w - 78,
        "HeitiLight",
        8.8,
        14.5,
        PAPER,
    )
    footer(c, 2)


def draw_intro_concept_half(c: canvas.Canvas, page: int) -> None:
    """Draw the continuous page 2-3 generated artwork."""
    w, h = A5
    with Image.open(INTRO_CONCEPT) as im:
        iw, ih = im.size
    spread_w = 2 * w
    scale = max(spread_w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    full_x = (spread_w - dw) / 2
    full_y = (h - dh) / 2
    page_offset = 0 if page == 2 else w
    c.drawImage(
        str(INTRO_CONCEPT),
        full_x - page_offset,
        full_y,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )


def page_concept(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(PAPER_LIGHT)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    draw_intro_concept_half(c, 3)
    c.saveState()
    c.setFillAlpha(0.8)
    c.setFillColor(PAPER_LIGHT)
    c.roundRect(22, 224, 185, 338, 4, stroke=0, fill=1)
    c.restoreState()
    small_caps(c, "HABITUS → INHERITANCE / 惯习与继承", 31, h - 35)
    c.setFillColor(INK)
    c.setFont("Songti", 22)
    c.drawString(31, h - 76, "历史如何变成本能？")

    steps = [
        (
            "01 / 惯习 HABITUS",
            "一种策略在特定环境里反复奏效，便不再只是经验，而会内化成身体倾向：还没有思考，动作已经先发生。",
        ),
        (
            "02 / 取舍 TRADE-OFF",
            "每代开局，玩家只能在速度、体型、耐力之间选择一次。强化任何一项，另外两项必然被削弱；没有“全都要”的位置。",
        ),
        (
            "03 / 继承 INHERITANCE",
            "本代系数与历代累计系数逐项相乘。上一代压缩过的方向，下一代要付出更高代价才能扳回，而扳回又会挤压别处。",
        ),
    ]
    y = h - 111
    for label, body in steps:
        c.setFillColor(AMBER)
        c.setFont("HeitiMedium", 6.5)
        c.drawString(31, y, label)
        y = draw_wrapped(c, body, 31, y - 17, 160, "HeitiLight", 7.8, 12.5, INK)
        y -= 17

    c.setFillColor(AMBER)
    c.setFont("HeitiMedium", 7.2)
    c.drawCentredString(308, 483, "速度")
    c.drawString(235, 296, "体型")
    c.drawRightString(381, 296, "耐力")
    c.saveState()
    c.setFillAlpha(0.84)
    c.setFillColor(INK)
    c.roundRect(24, 49, w - 48, 133, 3, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(AMBER)
    c.setFont("HelveticaNeue", 7.2)
    c.drawString(39, 152, "GEN 01 × GEN 02 × GEN 03 = PATH DEPENDENCE")
    c.setFillColor(PAPER)
    c.setFont("HeitiMedium", 10)
    c.drawString(39, 126, "你调节的不是这一代的鱼，")
    c.drawString(39, 108, "而是下一代还能怎样调节自己的余地。")
    draw_wrapped(
        c,
        "每一步都合理。反噬不来自愚蠢，来自时间。",
        39,
        80,
        w - 78,
        "HeitiLight",
        7.8,
        12,
        DIM_ON_DARK,
    )
    footer(c, 3)


def draw_spread_half(c: canvas.Canvas, page: int) -> None:
    w, h = A5
    c.setFillColor(INK)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    with Image.open(ERAS) as im:
        iw, ih = im.size
    spread_w = 2 * w
    scale = max(spread_w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    full_x = (spread_w - dw) / 2
    full_y = (h - dh) / 2
    page_offset = 0 if page == 4 else w
    c.drawImage(
        str(ERAS),
        full_x - page_offset,
        full_y,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.saveState()
    c.setFillAlpha(0.58)
    c.setFillColor(INK)
    c.rect(0, h - 92, w, 92, stroke=0, fill=1)
    c.restoreState()
    small_caps(c, "THREE GENERATIONS / 三代", 31, h - 29, PAPER)

    if page == 4:
        c.setFillColor(PAPER)
        c.setFont("Songti", 24)
        c.drawString(31, h - 64, "一 · 不周山")
        c.setFont("HelveticaNeue", 7)
        c.setFillColor(AMBER)
        c.drawString(31, h - 82, "SCARCITY / 活下来就是胜利")
        c.saveState()
        c.setFillAlpha(0.77)
        c.setFillColor(INK)
        c.roundRect(25, 31, w - 50, 105, 2, stroke=0, fill=1)
        c.restoreState()
        draw_wrapped(
            c,
            "捕食者环伺，物资极度匮乏。减小体型，把余量押给耐力或速度，是当时无可指摘的最优解。",
            39,
            105,
            w - 78,
            "HeitiLight",
            8.6,
            14,
            PAPER,
        )
        footer(c, 4, dark=True)
    else:
        c.setFillColor(PAPER)
        c.setFont("Songti", 18)
        c.drawString(31, h - 62, "二 · 黄金时代")
        c.setFillColor(AMBER)
        c.setFont("HelveticaNeue", 6.5)
        c.drawString(31, h - 79, "EXPANSION / 胆大者赢")
        c.saveState()
        c.setFillAlpha(0.76)
        c.setFillColor(INK)
        c.roundRect(25, 190, w - 50, 96, 2, stroke=0, fill=1)
        c.roundRect(25, 51, w - 50, 112, 2, stroke=0, fill=1)
        c.restoreState()
        draw_wrapped(
            c,
            "扩张成为新的及格线。鱼增大体型，开始捕食昨天还与自己平行的对手；账单却记在了下一代名下。",
            39,
            258,
            w - 78,
            "HeitiLight",
            8.4,
            13.5,
            PAPER,
        )
        c.setFillColor(PAPER)
        c.setFont("Songti", 16)
        c.drawString(39, 136, "三 · 东海车辙")
        c.setFillColor(AMBER)
        c.setFont("HelveticaNeue", 6.5)
        c.drawString(39, 118, "STAGNATION / 休息成为生存策略")
        draw_wrapped(
            c,
            "水体降温，正解是增加耐力、降低代谢。但历代取舍让旧邻居在体型差跨过阈值时，变成了捕食者。",
            39,
            96,
            w - 78,
            "HeitiLight",
            8.1,
            13,
            PAPER,
        )
        footer(c, 5, dark=True)


def page_simulation(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(PAPER_LIGHT)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    small_caps(c, "BENEATH THE SURFACE / 水面之下", 31, h - 35)
    c.setFillColor(INK)
    c.setFont("Songti", 24)
    c.drawString(31, h - 78, "鱼不是动画，是模拟。")
    draw_wrapped(
        c,
        "每条鱼只遵循局部规则。没有全局导航，没有上帝视角；群体性格从千万次相邻互动中涌现。",
        31,
        h - 106,
        w - 62,
        "HeitiLight",
        9.2,
        15,
        INK,
    )

    nodes = [
        ("01", "分离 / 对齐 / 凝聚", "经典 Boids 三力让群体行为自发形成。", 360),
        ("02", "两层捕猎力", "远处被鱼群吸引，近处锁定个体并 burst 冲刺。", 280),
        ("03", "恐慌的社会传播", "离散警报沿邻居网络扩散，并带衰减与不应期。", 200),
        ("04", "局部感知", "半径之外，捕食者只是一条普通的鱼。", 120),
    ]
    for num, title, body, y in nodes:
        c.setStrokeColor(RULE_ON_LIGHT)
        c.line(58, y, w - 31, y)
        c.setFillColor(AMBER)
        c.circle(42, y, 12, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont("HelveticaNeue", 6.5)
        c.drawCentredString(42, y - 2.2, num)
        c.setFont("HeitiMedium", 9.5)
        c.drawString(68, y + 7, title)
        c.setFont("HeitiLight", 7.7)
        c.setFillColor(Color(15 / 255, 14 / 255, 12 / 255, alpha=0.68))
        c.drawString(68, y - 12, body)

    c.setFillColor(INK)
    c.rect(31, 48, w - 62, 43, stroke=0, fill=1)
    c.setFillColor(PAPER)
    c.setFont("HeitiMedium", 8.6)
    c.drawString(43, 72, "红线：死因必须来自真实模拟。")
    c.setFillColor(DIM_ON_DARK)
    c.setFont("HeitiLight", 7.2)
    c.drawString(43, 57, "追逐、恐慌与力竭真实发生，因果不是编出来的。")
    footer(c, 6)


def page_philosophy(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(INK)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    small_caps(c, "THE DEBT OF REST / 休息的债", 31, h - 35, PAPER)
    c.setFillColor(PAPER)
    c.setFont("Songti", 21)
    c.drawString(31, h - 78, "越完美地适应一个时代，")
    c.drawString(31, h - 106, "越可能过拟合于一个已经消失的世界。")

    concepts = [
        ("HABITUS / 惯习", "过去被身体记住，成为尚未思考就已发生的选择。"),
        ("PATH DEPENDENCE / 路径依赖", "早期取舍经由连乘自我锁定，后代永远无法回到白纸。"),
        ("ANTIFRAGILITY / 反脆弱", "对单一环境的极致优化，就是对环境变化的极致脆弱。"),
    ]
    y = 405
    for idx, (label, body) in enumerate(concepts):
        c.setStrokeColor(AMBER if idx == 0 else RULE_ON_DARK)
        c.setLineWidth(1 if idx == 0 else 0.5)
        c.line(31, y, 77, y)
        c.setFillColor(AMBER)
        c.setFont("HelveticaNeue", 7)
        c.drawString(92, y - 2, label)
        draw_wrapped(c, body, 92, y - 21, w - 123, "HeitiLight", 8.2, 13.5, PAPER)
        y -= 86

    c.setStrokeColor(AMBER)
    c.setLineWidth(0.8)
    c.line(31, 139, w - 31, 139)
    c.setFillColor(PAPER)
    c.setFont("HeitiMedium", 11)
    c.drawString(31, 113, "在东海车辙里，休息本身就是生存策略。")
    draw_wrapped(
        c,
        "恢复力不是可以永远向下游赊账的资源。对一群鱼如此，对连轴转的一代人也如此。",
        31,
        89,
        w - 62,
        "HeitiLight",
        8.3,
        13.5,
        DIM_ON_DARK,
    )
    footer(c, 7, dark=True)


def page_back(c: canvas.Canvas) -> None:
    w, h = A5
    c.setFillColor(PAPER_LIGHT)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    small_caps(c, "JOIN THE EXPERIMENT / 加入实验", 31, h - 35)
    c.setFillColor(INK)
    c.setFont("Songti", 21)
    c.drawString(31, h - 70, "亲手做一次“上游”。")
    draw_wrapped(
        c,
        "为一群鱼选择三代进化方向，然后站在下游，看着每一个当时正确的决定如何流向未来。",
        31,
        h - 96,
        w - 62,
        "HeitiLight",
        8,
        13,
        INK,
    )

    qr_size = 140
    qr_x = 31
    qr_y = 322
    c.setFillColor(WHITE)
    c.roundRect(qr_x - 6, qr_y - 6, qr_size + 12, qr_size + 12, 3, stroke=0, fill=1)
    c.drawImage(str(QR_CROP), qr_x, qr_y, qr_size, qr_size, preserveAspectRatio=True, mask="auto")

    c.setFillColor(INK)
    c.setFont("HeitiMedium", 7.2)
    c.drawCentredString(qr_x + qr_size / 2, 304, "下游 downstream 玩家用户体验群")
    c.setFillColor(Color(15 / 255, 14 / 255, 12 / 255, alpha=0.52))
    c.setFont("HeitiLight", 6)
    c.drawCentredString(qr_x + qr_size / 2, 290, "入群码有效期至 8/2 · 入群后将更新")

    c.setFillColor(AMBER)
    c.setFont("HelveticaNeue", 7)
    c.drawString(203, 433, "TEMPORARY DOMAIN")
    c.setFillColor(INK)
    c.setFont("HelveticaNeue", 13)
    c.drawString(203, 410, "advx.billyashlet.com")
    draw_wrapped(
        c,
        "boids 算法 · 模拟进化\n代际选择 · 休息与恢复",
        203,
        375,
        w - 234,
        "HeitiLight",
        7,
        12,
        Color(15 / 255, 14 / 255, 12 / 255, alpha=0.62),
    )

    c.setStrokeColor(AMBER)
    c.setLineWidth(0.8)
    c.line(31, 267, w - 31, 267)
    c.setFillColor(AMBER)
    c.setFont("HeitiMedium", 7)
    c.drawString(31, 249, "创作团队 / CREDITS")

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
            "模型形态参数化与躯体自由度系统实现、模型渲染优化、相机视锥剔除\n（Frustum Culling）与可见性渲染优化\n3D 场景架构、渲染风格定义与规范",
            "akbptech@gmail.com",
        ),
    ]
    gap = 12
    col_w = (w - 62 - 2 * gap) / 3
    for index, (name, role, contact) in enumerate(credits):
        x = 31 + index * (col_w + gap)
        c.setFillColor(INK)
        c.setFont("HeitiMedium", 7.6)
        c.drawString(x, 228, name)
        y = draw_wrapped(c, role, x, 208, col_w, "HeitiLight", 5.8, 8.6, INK)
        c.setFillColor(AMBER)
        c.setFont("HelveticaNeue", 5.4)
        c.drawString(x, y - 8, contact)
    footer(c, 8)


def build_reading_pdf() -> None:
    c = canvas.Canvas(str(READING_PDF), pagesize=A5, pageCompression=1)
    c.setTitle("下游 / Downstream - 展览宣传册")
    c.setAuthor("Downstream / AdventureX 2026")
    c.setSubject("关于代际继承、路径依赖与休息之债的叙事交互装置")
    pages = [
        page_cover,
        page_intro,
        page_concept,
        lambda cv: draw_spread_half(cv, 4),
        lambda cv: draw_spread_half(cv, 5),
        page_simulation,
        page_philosophy,
        page_back,
    ]
    for draw in pages:
        draw(c)
        c.showPage()
    c.save()


def build_print_pdf() -> None:
    reader = PdfReader(str(READING_PDF))
    page_w, page_h = map(float, A5)
    sheet_w, sheet_h = map(float, landscape(A4))
    x_margin = (sheet_w - 2 * page_w) / 2
    y_margin = (sheet_h - page_h) / 2
    # 1-based reading-page pairs for an 8-page saddle-stitched booklet.
    pairs = [(8, 1), (2, 7), (6, 3), (4, 5)]
    writer = PdfWriter()
    for left_no, right_no in pairs:
        sheet = PageObject.create_blank_page(width=sheet_w, height=sheet_h)
        left = reader.pages[left_no - 1]
        right = reader.pages[right_no - 1]
        sheet.merge_transformed_page(left, Transformation().translate(x_margin, y_margin))
        sheet.merge_transformed_page(right, Transformation().translate(x_margin + page_w, y_margin))
        writer.add_page(sheet)
    writer.add_metadata(
        {
            "/Title": "下游 / Downstream - A4 双面打印拼版",
            "/Author": "Downstream / AdventureX 2026",
            "/Subject": "8 页 A5 骑马钉小册的 A4 双面打印拼版",
        }
    )
    with PRINT_PDF.open("wb") as stream:
        writer.write(stream)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PDF_OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    register_fonts()
    crop_qr()
    build_reading_pdf()
    build_print_pdf()
    print(READING_PDF)
    print(PRINT_PDF)


if __name__ == "__main__":
    main()
