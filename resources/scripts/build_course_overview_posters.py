from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "tutorial-assets" / "course-system" / "premium-posters"
WIDTH, HEIGHT = 1440, 2560

FONT_CN_SERIF = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")
FONT_CN_SANS = Path(r"C:\Windows\Fonts\Noto Sans SC (TrueType).otf")
FONT_CN_SANS_MEDIUM = Path(r"C:\Windows\Fonts\Noto Sans SC Medium (TrueType).otf")
FONT_CN_SANS_BOLD = Path(r"C:\Windows\Fonts\Noto Sans SC Bold (TrueType).otf")
FONT_EN_SERIF = Path(r"C:\Windows\Fonts\georgia.ttf")
FONT_EN_SERIF_ITALIC = Path(r"C:\Windows\Fonts\georgiai.ttf")
FONT_EN_SANS = Path(r"C:\Windows\Fonts\bahnschrift.ttf")

IVORY = (239, 235, 226, 255)
SOFT_WHITE = (214, 211, 203, 255)
MUTED = (158, 155, 148, 255)
COPPER = (199, 151, 116, 255)
LIGHT_COPPER = (221, 183, 144, 255)
DARK_COPPER = (129, 92, 67, 255)
BLACK = (4, 4, 4, 255)

TITLE = "AI超级个体与企业提效实战营"
SUBTITLE = "一个人的AI团队，一家企业的提效系统"
ENTREPRENEUR_VALUE = "一个人使用AI，创造过去一个团队的价值"
ENTERPRISE_VALUE = "员工提高单人产出，组织实现降本增效"

PHASES = [
    (
        "01—08",
        "通用工具基础",
        "任务分配 · 定位 · 知识库 · 内容 · 图片 · 视频 · GEO",
    ),
    (
        "09—13",
        "一人公司创业",
        "方向验证 · 产品设计 · 内容获客 · 抖音截流 · 项目交付",
    ),
    (
        "14—18",
        "企业降本增效",
        "岗位提效 · 知识沉淀 · 内容生产线 · 获客系统 · 智能体团队",
    ),
    (
        "19—20",
        "综合落地",
        "AI团队搭建 · 30天行动方案",
    ),
]

TOOLS = "AI中台  ·  抖音截流  ·  WorkBuddy  ·  通用大模型与专业工具"
CAPABILITY_CHAIN = "定位   →   生产   →   传播   →   获客   →   交付   →   复盘"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    path: Path,
    max_size: int,
    min_size: int,
    max_width: int,
) -> ImageFont.FreeTypeFont:
    for size in range(max_size, min_size - 1, -2):
        candidate = font(path, size)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= max_width:
            return candidate
    return font(path, min_size)


def cover_background(path: Path, *, brightness: float = 0.8) -> Image.Image:
    image = Image.open(path).convert("RGB")
    image = ImageOps.fit(
        image,
        (WIDTH, HEIGHT),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    image = ImageEnhance.Brightness(image).enhance(brightness)
    return image.convert("RGBA")


def overlay(image: Image.Image, box: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(box, fill=fill)
    image.alpha_composite(layer)


def vertical_fade(
    image: Image.Image,
    y0: int,
    y1: int,
    *,
    start_alpha: int,
    end_alpha: int,
) -> None:
    height = max(1, y1 - y0)
    fade = Image.new("RGBA", (WIDTH, height), (0, 0, 0, 0))
    pixels = fade.load()
    for y in range(height):
        alpha = int(start_alpha + (end_alpha - start_alpha) * (y / max(1, height - 1)))
        for x in range(WIDTH):
            pixels[x, y] = (0, 0, 0, alpha)
    image.alpha_composite(fade, (0, y0))


def tracked_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    text_font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    tracking: int,
) -> None:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=text_font, fill=fill)
        box = draw.textbbox((x, y), char, font=text_font)
        x += box[2] - box[0] + tracking


def rule(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    *,
    fill: tuple[int, int, int, int] = DARK_COPPER,
    width: int = 2,
) -> None:
    draw.line(xy, fill=fill, width=width)


def draw_phase(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    phase: tuple[str, str, str],
    *,
    number_color: tuple[int, int, int, int] = COPPER,
    line_color: tuple[int, int, int, int] = DARK_COPPER,
) -> None:
    x0, y0, x1, y1 = box
    number, title, detail = phase
    rule(draw, (x0, y0, x1, y0), fill=line_color, width=2)
    draw.text((x0, y0 + 24), number, font=font(FONT_EN_SERIF, 32), fill=number_color)
    title_font = fit_font(draw, title, FONT_CN_SERIF, 46, 34, x1 - x0 - 210)
    draw.text((x0 + 190, y0 + 13), title, font=title_font, fill=IVORY)
    detail_font = fit_font(draw, detail, FONT_CN_SANS, 27, 22, x1 - x0)
    draw.text((x0, y0 + 88), detail, font=detail_font, fill=SOFT_WHITE)
    rule(draw, (x0, y1, x1, y1), fill=(80, 65, 55, 180), width=1)


def draw_brand_header(
    draw: ImageDraw.ImageDraw,
    *,
    top: int,
    left: int,
    max_width: int,
    title_color: tuple[int, int, int, int] = IVORY,
    accent: tuple[int, int, int, int] = COPPER,
) -> int:
    tracked_text(
        draw,
        (left, top),
        "AI BUSINESS OPERATING SYSTEM",
        font(FONT_EN_SANS, 24),
        accent,
        7,
    )
    rule(draw, (left, top + 54, left + max_width, top + 54), fill=(151, 110, 82, 160), width=2)
    title_font = fit_font(draw, TITLE, FONT_CN_SERIF, 106, 74, max_width)
    draw.text((left, top + 84), TITLE, font=title_font, fill=title_color)
    sub_font = fit_font(draw, SUBTITLE, FONT_CN_SANS, 40, 30, max_width)
    draw.text((left, top + 216), SUBTITLE, font=sub_font, fill=SOFT_WHITE)
    tracked_text(
        draw,
        (left, top + 282),
        "20 LESSONS  ·  30–60 MIN",
        font(FONT_EN_SERIF, 25),
        accent,
        4,
    )
    return top + 340


def draw_dual_value(
    draw: ImageDraw.ImageDraw,
    *,
    top: int,
    left: int,
    width: int,
    accent: tuple[int, int, int, int] = COPPER,
) -> None:
    half = (width - 44) // 2
    rule(draw, (left, top, left + width, top), fill=(153, 112, 82, 180), width=2)
    draw.text((left, top + 24), "FOR SOLO BUSINESS", font=font(FONT_EN_SERIF_ITALIC, 23), fill=accent)
    draw.text((left, top + 62), "一人公司创业者", font=font(FONT_CN_SERIF, 42), fill=IVORY)
    value_font = fit_font(draw, ENTREPRENEUR_VALUE, FONT_CN_SANS, 28, 22, half)
    draw.text((left, top + 122), ENTREPRENEUR_VALUE, font=value_font, fill=SOFT_WHITE)

    x2 = left + half + 44
    rule(draw, (left + half + 20, top + 24, left + half + 20, top + 170), fill=(110, 82, 65, 150), width=1)
    draw.text((x2, top + 24), "FOR ENTERPRISE", font=font(FONT_EN_SERIF_ITALIC, 23), fill=accent)
    draw.text((x2, top + 62), "企业与企业员工", font=font(FONT_CN_SERIF, 42), fill=IVORY)
    enterprise_font = fit_font(draw, ENTERPRISE_VALUE, FONT_CN_SANS, 28, 22, half)
    draw.text((x2, top + 122), ENTERPRISE_VALUE, font=enterprise_font, fill=SOFT_WHITE)


def draw_footer(
    draw: ImageDraw.ImageDraw,
    *,
    top: int,
    left: int,
    width: int,
    accent: tuple[int, int, int, int] = COPPER,
) -> None:
    rule(draw, (left, top, left + width, top), fill=(151, 110, 82, 190), width=2)
    draw.text((left, top + 24), "TOOL ECOSYSTEM", font=font(FONT_EN_SERIF_ITALIC, 24), fill=accent)
    tool_font = fit_font(draw, TOOLS, FONT_CN_SANS_MEDIUM, 31, 23, width)
    draw.text((left, top + 70), TOOLS, font=tool_font, fill=IVORY)
    rule(draw, (left, top + 132, left + width, top + 132), fill=(92, 73, 61, 170), width=1)
    chain_font = fit_font(draw, CAPABILITY_CHAIN, FONT_CN_SANS_MEDIUM, 31, 23, width)
    draw.text((left, top + 164), CAPABILITY_CHAIN, font=chain_font, fill=SOFT_WHITE)
    tracked_text(
        draw,
        (left, top + 224),
        "FROM TOOLS TO A REPEATABLE BUSINESS SYSTEM",
        font(FONT_EN_SANS, 19),
        MUTED,
        4,
    )


def compose_obsidian() -> Path:
    source = ASSET_DIR / "background-a-obsidian-mountain.png"
    image = cover_background(source, brightness=0.72)
    vertical_fade(image, 0, 950, start_alpha=70, end_alpha=5)
    vertical_fade(image, 1330, HEIGHT, start_alpha=0, end_alpha=235)
    overlay(image, (0, 0, WIDTH, 510), (0, 0, 0, 55))
    overlay(image, (0, 1715, WIDTH, HEIGHT), (1, 1, 1, 178))
    draw = ImageDraw.Draw(image)

    draw_brand_header(draw, top=92, left=104, max_width=1232)
    draw_dual_value(draw, top=500, left=104, width=1232)

    draw.text((104, 1542), "COURSE ARCHITECTURE", font=font(FONT_EN_SERIF_ITALIC, 28), fill=COPPER)
    draw.text((104, 1584), "四阶段 · 二十节实战课程", font=font(FONT_CN_SERIF, 48), fill=IVORY)
    phase_top = 1660
    phase_height = 146
    for index, phase in enumerate(PHASES):
        y0 = phase_top + index * phase_height
        draw_phase(draw, (104, y0, 1336, y0 + 125), phase)
    draw_footer(draw, top=2270, left=104, width=1232)

    output = ASSET_DIR / "course-overview-a-obsidian-mountain.png"
    image.convert("RGB").save(output, quality=96)
    return output


def compose_architecture() -> Path:
    source = ASSET_DIR / "background-b-golden-architecture.png"
    image = cover_background(source, brightness=0.78)
    overlay(image, (0, 0, WIDTH, 1180), (0, 0, 0, 36))
    vertical_fade(image, 860, 1560, start_alpha=5, end_alpha=200)
    overlay(image, (0, 1460, WIDTH, HEIGHT), (1, 1, 1, 210))
    draw = ImageDraw.Draw(image)

    draw_brand_header(draw, top=100, left=92, max_width=1256, title_color=IVORY, accent=LIGHT_COPPER)
    draw_dual_value(draw, top=492, left=92, width=1256, accent=LIGHT_COPPER)

    draw.text((92, 885), "20", font=font(FONT_EN_SERIF, 210), fill=(210, 169, 121, 245))
    draw.text((330, 945), "节课，建立可持续运行的AI业务系统", font=font(FONT_CN_SERIF, 47), fill=IVORY)
    rule(draw, (330, 1020, 1348, 1020), fill=(190, 145, 107, 180), width=2)

    draw.text((92, 1498), "COURSE MAP", font=font(FONT_EN_SERIF_ITALIC, 27), fill=LIGHT_COPPER)
    draw.text((92, 1540), "从工具使用，到商业结果", font=font(FONT_CN_SERIF, 50), fill=IVORY)
    phase_top = 1625
    phase_height = 147
    for index, phase in enumerate(PHASES):
        y0 = phase_top + index * phase_height
        draw_phase(
            draw,
            (92, y0, 1348, y0 + 126),
            phase,
            number_color=LIGHT_COPPER,
            line_color=(177, 135, 99, 175),
        )
    draw_footer(draw, top=2262, left=92, width=1256, accent=LIGHT_COPPER)

    output = ASSET_DIR / "course-overview-b-golden-architecture.png"
    image.convert("RGB").save(output, quality=96)
    return output


def compose_data_core() -> Path:
    source = ASSET_DIR / "background-c-bronze-data-core.png"
    image = cover_background(source, brightness=0.8)
    overlay(image, (0, 0, WIDTH, 720), (0, 0, 0, 62))
    vertical_fade(image, 1060, 1640, start_alpha=5, end_alpha=215)
    overlay(image, (0, 1480, WIDTH, HEIGHT), (1, 1, 1, 220))
    draw = ImageDraw.Draw(image)

    draw_brand_header(draw, top=98, left=100, max_width=1240, accent=LIGHT_COPPER)
    draw_dual_value(draw, top=500, left=100, width=1240, accent=LIGHT_COPPER)

    draw.text((100, 1198), "AI MIDDLE PLATFORM", font=font(FONT_EN_SERIF_ITALIC, 28), fill=LIGHT_COPPER)
    draw.text((100, 1240), "一个中台，连接完整业务闭环", font=font(FONT_CN_SERIF, 54), fill=IVORY)
    draw.text(
        (100, 1320),
        "定位、创作、GEO、截流与企业提效，在同一套系统中持续沉淀。",
        font=font(FONT_CN_SANS, 28),
        fill=SOFT_WHITE,
    )
    rule(draw, (100, 1385, 1340, 1385), fill=(182, 135, 96, 180), width=2)

    draw.text((100, 1515), "20 LESSONS / 4 STAGES", font=font(FONT_EN_SERIF_ITALIC, 27), fill=COPPER)
    phase_top = 1570
    phase_height = 146
    for index, phase in enumerate(PHASES):
        y0 = phase_top + index * phase_height
        draw_phase(draw, (100, y0, 1340, y0 + 125), phase)
    draw_footer(draw, top=2200, left=100, width=1240, accent=COPPER)

    output = ASSET_DIR / "course-overview-c-bronze-data-core.png"
    image.convert("RGB").save(output, quality=96)
    return output


def validate(outputs: Iterable[Path]) -> None:
    for output in outputs:
        with Image.open(output) as image:
            if image.size != (WIDTH, HEIGHT):
                raise ValueError(f"{output.name}: expected {(WIDTH, HEIGHT)}, got {image.size}")
            if image.mode not in {"RGB", "RGBA"}:
                raise ValueError(f"{output.name}: unexpected mode {image.mode}")


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    required_fonts = [
        FONT_CN_SERIF,
        FONT_CN_SANS,
        FONT_CN_SANS_MEDIUM,
        FONT_EN_SERIF,
        FONT_EN_SERIF_ITALIC,
        FONT_EN_SANS,
    ]
    missing = [str(path) for path in required_fonts if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing fonts: " + ", ".join(missing))

    outputs = [compose_obsidian(), compose_architecture(), compose_data_core()]
    validate(outputs)
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
