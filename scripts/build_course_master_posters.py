from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "tutorial-assets" / "course-system" / "premium-posters"
SOURCE = ASSET_DIR / "background-b-golden-architecture.png"

WIDTH, HEIGHT = 2160, 3840
SCALE = 1.5

FONT_CN_SERIF = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")
FONT_CN_SANS = Path(r"C:\Windows\Fonts\Noto Sans SC (TrueType).otf")
FONT_CN_SANS_MEDIUM = Path(r"C:\Windows\Fonts\Noto Sans SC Medium (TrueType).otf")
FONT_CN_SANS_BOLD = Path(r"C:\Windows\Fonts\Noto Sans SC Bold (TrueType).otf")
FONT_EN_SERIF = Path(r"C:\Windows\Fonts\georgia.ttf")
FONT_EN_SERIF_ITALIC = Path(r"C:\Windows\Fonts\georgiai.ttf")
FONT_EN_SANS = Path(r"C:\Windows\Fonts\bahnschrift.ttf")

# 招财猫品牌视觉规范：
# 哑光金 #C8A951 / 深石墨灰 #2B2B2B / 暖米白 #F7F3EA / 香槟金 #D4B76A
IVORY = (247, 243, 234, 255)
SOFT_WHITE = (247, 243, 234, 255)
MUTED = (212, 183, 106, 255)
GOLD = (212, 183, 106, 255)
COPPER = (200, 169, 81, 255)
DARK_GOLD = (200, 169, 81, 210)
GRAPHITE = (43, 43, 43, 255)

COURSE_TITLE = "AI超级个体与企业提效实战营"
COURSE_SUBTITLE = "一个人的AI团队，一家企业的提效系统"
TOOLS = "AI中台  ·  抖音截流  ·  WorkBuddy  ·  通用大模型与专业工具"


def px(value: int | float) -> int:
    return round(value * SCALE)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=px(size))


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
        if draw.textbbox((0, 0), text, font=candidate)[2] <= px(max_width):
            return candidate
    return font(path, min_size)


def background(*, brightness: float = 0.78, centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    image = Image.open(SOURCE).convert("RGB")
    image = ImageOps.fit(
        image,
        (WIDTH, HEIGHT),
        method=Image.Resampling.LANCZOS,
        centering=centering,
    )
    return ImageEnhance.Brightness(image).enhance(brightness).convert("RGBA")


def rectangle(
    image: Image.Image,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int, int],
) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(tuple(px(v) for v in box), fill=fill)
    image.alpha_composite(layer)


def vertical_fade(
    image: Image.Image,
    y0: int,
    y1: int,
    *,
    start_alpha: int,
    end_alpha: int,
) -> None:
    top, bottom = px(y0), px(y1)
    height = max(1, bottom - top)
    fade = Image.new("RGBA", (WIDTH, height), (0, 0, 0, 0))
    fade_draw = ImageDraw.Draw(fade)
    for y in range(height):
        alpha = round(start_alpha + (end_alpha - start_alpha) * y / max(1, height - 1))
        fade_draw.line((0, y, WIDTH, y), fill=(0, 0, 0, alpha))
    image.alpha_composite(fade, (0, top))


def rule(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    *,
    fill: tuple[int, int, int, int] = DARK_GOLD,
    width: int = 1,
) -> None:
    draw.line(tuple(px(v) for v in xy), fill=fill, width=max(1, px(width)))


def tracked_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    text_font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    tracking: int,
) -> None:
    x, y = px(xy[0]), px(xy[1])
    for char in text:
        draw.text((x, y), char, font=text_font, fill=fill)
        box = draw.textbbox((x, y), char, font=text_font)
        x += box[2] - box[0] + px(tracking)


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    text_font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int] = IVORY,
) -> None:
    draw.text(
        (px(xy[0]), px(xy[1])),
        value,
        font=text_font,
        fill=fill,
        stroke_width=px(1),
        stroke_fill=(18, 18, 17, 230),
    )


def brand_header(
    draw: ImageDraw.ImageDraw,
    *,
    eyebrow: str,
    title: str,
    subtitle: str,
) -> None:
    tracked_text(draw, (92, 94), eyebrow, font(FONT_EN_SANS, 22), GOLD, 6)
    rule(draw, (92, 146, 1348, 146), fill=(195, 145, 105, 170), width=2)
    title_font = fit_font(draw, title, FONT_CN_SERIF, 98, 66, 1256)
    text(draw, (92, 176), title, title_font)
    subtitle_font = fit_font(draw, subtitle, FONT_CN_SANS, 36, 28, 1256)
    text(draw, (92, 306), subtitle, subtitle_font, SOFT_WHITE)


def course_signature(draw: ImageDraw.ImageDraw, *, top: int = 2350) -> None:
    rule(draw, (92, top, 1348, top), fill=(177, 130, 96, 190), width=2)
    text(draw, (92, top + 30), COURSE_TITLE, font(FONT_CN_SERIF, 39), IVORY)
    text(draw, (92, top + 88), COURSE_SUBTITLE, font(FONT_CN_SANS, 25), SOFT_WHITE)
    text(draw, (92, top + 146), TOOLS, font(FONT_CN_SANS_MEDIUM, 25), GOLD)
    tracked_text(
        draw,
        (92, top + 215),
        "ONE PLATFORM · TWO VALUE PATHS · ONE BUSINESS SYSTEM",
        font(FONT_EN_SANS, 18),
        MUTED,
        3,
    )


def draw_bullet_block(
    draw: ImageDraw.ImageDraw,
    *,
    left: int,
    top: int,
    width: int,
    label_en: str,
    title_cn: str,
    bullets: list[str],
    outputs: str,
) -> None:
    text(draw, (left, top), label_en, font(FONT_EN_SERIF_ITALIC, 22), GOLD)
    title_font = fit_font(draw, title_cn, FONT_CN_SERIF, 48, 36, width)
    text(draw, (left, top + 42), title_cn, title_font)
    rule(draw, (left, top + 112, left + width, top + 112), fill=(165, 120, 89, 180), width=1)

    y = top + 144
    for item in bullets:
        text(draw, (left, y + 1), "·", font(FONT_CN_SERIF, 31), GOLD)
        item_font = fit_font(draw, item, FONT_CN_SANS_MEDIUM, 28, 23, width - 36)
        text(draw, (left + 30, y), item, item_font, SOFT_WHITE)
        y += 58

    rule(draw, (left, y + 6, left + width, y + 6), fill=(100, 78, 65, 150), width=1)
    text(draw, (left, y + 28), "可带走成果", font(FONT_CN_SANS_MEDIUM, 22), GOLD)
    output_font = fit_font(draw, outputs, FONT_CN_SANS_MEDIUM, 26, 21, width)
    text(draw, (left, y + 70), outputs, output_font, IVORY)


def compose_overview_hd() -> Path:
    image = background(brightness=0.8)
    rectangle(image, (0, 0, 1440, 800), (43, 43, 43, 76))
    vertical_fade(image, 760, 1500, start_alpha=5, end_alpha=205)
    rectangle(image, (0, 1450, 1440, 2560), (18, 18, 17, 232))
    draw = ImageDraw.Draw(image)

    brand_header(
        draw,
        eyebrow="AI BUSINESS OPERATING SYSTEM",
        title=COURSE_TITLE,
        subtitle=COURSE_SUBTITLE,
    )
    text(draw, (92, 390), "20", font(FONT_EN_SERIF, 190), GOLD)
    text(draw, (318, 448), "节课，建立可持续运行的AI业务系统", font(FONT_CN_SERIF, 43), IVORY)
    rule(draw, (318, 522, 1348, 522), fill=(190, 145, 107, 180), width=2)

    text(draw, (92, 720), "ONE PLATFORM · TWO VALUE PATHS", font(FONT_EN_SERIF_ITALIC, 24), GOLD)
    text(draw, (92, 762), "一套工具体系，同时服务个人创业与企业提效", font(FONT_CN_SERIF, 43), IVORY)

    text(draw, (92, 1500), "COURSE MAP", font(FONT_EN_SERIF_ITALIC, 26), GOLD)
    text(draw, (92, 1542), "从工具使用，到商业结构", font(FONT_CN_SERIF, 48), IVORY)
    phases = [
        ("01—08", "通用工具基础", "任务分配 · 定位 · 知识库 · 内容 · 图片 · 视频 · GEO"),
        ("09—13", "一人公司创业", "方向验证 · 产品设计 · 内容获客 · 抖音截流 · 项目交付"),
        ("14—18", "企业降本增效", "岗位提效 · 知识沉淀 · 内容生产线 · 获客系统 · 智能体团队"),
        ("19—20", "综合落地", "AI团队搭建 · 30天行动方案"),
    ]
    y = 1630
    for number, phase_title, detail in phases:
        rule(draw, (92, y, 1348, y), fill=(172, 128, 96, 175), width=2)
        text(draw, (92, y + 24), number, font(FONT_EN_SERIF, 30), GOLD)
        text(draw, (275, y + 17), phase_title, font(FONT_CN_SERIF, 41), IVORY)
        detail_font = fit_font(draw, detail, FONT_CN_SANS_MEDIUM, 27, 23, 1256)
        text(draw, (92, y + 78), detail, detail_font, SOFT_WHITE)
        y += 143

    course_signature(draw, top=2250)
    output = ASSET_DIR / "course-overview-b-final-hd.png"
    image.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def compose_dual_value() -> Path:
    image = background(brightness=0.7, centering=(0.5, 0.42))
    rectangle(image, (0, 0, 1440, 620), (43, 43, 43, 92))
    vertical_fade(image, 520, 1240, start_alpha=12, end_alpha=225)
    rectangle(image, (0, 1180, 1440, 2560), (18, 18, 17, 238))
    draw = ImageDraw.Draw(image)

    brand_header(
        draw,
        eyebrow="DUAL VALUE SYSTEM",
        title="可收获价值总纲",
        subtitle="同一套AI中台，两条真实价值路径",
    )
    text(draw, (92, 420), "01", font(FONT_EN_SERIF, 175), GOLD)
    text(draw, (292, 476), "让个人拥有团队能力", font(FONT_CN_SERIF, 46), IVORY)
    text(draw, (92, 610), "02", font(FONT_EN_SERIF, 175), (204, 164, 120, 220))
    text(draw, (292, 666), "让企业形成组织效率", font(FONT_CN_SERIF, 46), IVORY)

    text(draw, (92, 1195), "VISIBLE OUTCOMES", font(FONT_EN_SERIF_ITALIC, 25), GOLD)
    text(draw, (92, 1237), "学完能看见、能展示、能复用的成果", font(FONT_CN_SERIF, 45), IVORY)

    draw_bullet_block(
        draw,
        left=92,
        top=1335,
        width=590,
        label_en="FOR SOLO BUSINESS",
        title_cn="一人公司创业者",
        bullets=[
            "一个人管理一支AI团队",
            "完成定位、内容、获客与交付",
            "把个人经验沉淀为可复用系统",
            "创造过去一个团队的价值",
        ],
        outputs="启动方案 · 内容资产 · 客户线索\nAI团队组织图",
    )
    rule(draw, (720, 1335, 720, 2105), fill=(130, 96, 75, 150), width=1)
    draw_bullet_block(
        draw,
        left=758,
        top=1335,
        width=590,
        label_en="FOR ENTERPRISE",
        title_cn="企业与企业员工",
        bullets=[
            "员工提高单人产出",
            "知识、内容与流程统一沉淀",
            "减少重复劳动和协作成本",
            "组织实现可衡量的降本增效",
        ],
        outputs="岗位提效地图 · 企业知识库\n内容生产线 · AI试点方案",
    )

    course_signature(draw, top=2215)
    output = ASSET_DIR / "dual-value-system-b-hd.png"
    image.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def compose_capability_upgrade() -> Path:
    image = background(brightness=0.68, centering=(0.5, 0.55))
    rectangle(image, (0, 0, 1440, 640), (43, 43, 43, 88))
    vertical_fade(image, 500, 1250, start_alpha=10, end_alpha=230)
    rectangle(image, (0, 1170, 1440, 2560), (18, 18, 17, 240))
    draw = ImageDraw.Draw(image)

    brand_header(
        draw,
        eyebrow="CAPABILITY UPGRADE PATH",
        title="能力升级总纲",
        subtitle="从会用AI工具，到拥有可持续运行的AI业务系统",
    )
    text(draw, (92, 420), "6", font(FONT_EN_SERIF, 205), GOLD)
    text(draw, (250, 486), "级能力进阶", font(FONT_CN_SERIF, 49), IVORY)
    text(draw, (92, 650), "每一级都连接真实任务、产品操作与可验收成果", font(FONT_CN_SANS, 29), SOFT_WHITE)

    text(draw, (92, 1185), "FROM POSITIONING TO OPTIMIZATION", font(FONT_EN_SERIF_ITALIC, 24), GOLD)
    text(draw, (92, 1228), "完整业务闭环，不是零散工具清单", font(FONT_CN_SERIF, 45), IVORY)

    steps = [
        ("01", "定位", "明确人群、价值与产品方向"),
        ("02", "生产", "文案、图片、视频协同创作"),
        ("03", "传播", "GEO多平台定向发布"),
        ("04", "获客", "抖音截流识别意向客户"),
        ("05", "交付", "形成项目方案与成果包"),
        ("06", "复盘", "数据、知识与Skill持续沉淀"),
    ]
    y = 1330
    for index, (number, step_title, detail) in enumerate(steps):
        left = 92 if index % 2 == 0 else 742
        if index % 2 == 0 and index > 0:
            y += 240
        top = y
        width = 606
        rule(draw, (left, top, left + width, top), fill=(178, 133, 98, 180), width=2)
        text(draw, (left, top + 24), number, font(FONT_EN_SERIF, 30), GOLD)
        text(draw, (left + 112, top + 16), step_title, font(FONT_CN_SERIF, 43), IVORY)
        detail_font = fit_font(draw, detail, FONT_CN_SANS_MEDIUM, 28, 23, width)
        text(draw, (left, top + 85), detail, detail_font, SOFT_WHITE)
        text(draw, (left, top + 145), "可执行 · 可检查 · 可复用", font(FONT_CN_SANS, 21), MUTED)
        if index % 2 == 0:
            rule(draw, (720, top + 18, 720, top + 180), fill=(125, 94, 75, 130), width=1)

    text(draw, (92, 2110), "AI中台贯穿六级能力，把每次操作沉淀为长期资产", font(FONT_CN_SERIF, 39), GOLD)
    course_signature(draw, top=2215)
    output = ASSET_DIR / "capability-upgrade-b-hd.png"
    image.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def validate(outputs: Iterable[Path]) -> None:
    for output in outputs:
        with Image.open(output) as image:
            if image.size != (WIDTH, HEIGHT):
                raise ValueError(f"{output.name}: expected {(WIDTH, HEIGHT)}, got {image.size}")
            if image.mode != "RGB":
                raise ValueError(f"{output.name}: expected RGB, got {image.mode}")


def main() -> None:
    required = [
        SOURCE,
        FONT_CN_SERIF,
        FONT_CN_SANS,
        FONT_CN_SANS_MEDIUM,
        FONT_CN_SANS_BOLD,
        FONT_EN_SERIF,
        FONT_EN_SERIF_ITALIC,
        FONT_EN_SANS,
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required files: " + ", ".join(missing))

    outputs = [compose_overview_hd(), compose_dual_value(), compose_capability_upgrade()]
    validate(outputs)
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
