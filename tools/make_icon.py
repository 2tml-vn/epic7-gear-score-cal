"""Generate the application icon (PNG + multi-size ICO) with Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets"
SIZE = 256

BG = (12, 18, 27, 255)
BG_INNER = (21, 30, 43, 255)
GOLD = (217, 180, 91, 255)
GOLD_LIGHT = (242, 212, 136, 255)
FAINT = (92, 106, 126, 255)


def load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_image() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    rounded_rect(draw, (8, 8, 248, 248), 48, BG, GOLD, 8)
    rounded_rect(draw, (20, 20, 236, 236), 38, BG_INNER, FAINT, 2)

    # A sparse spreadsheet grid in the background.
    for x in range(52, 225, 34):
        draw.line((x, 36, x, 220), fill=(44, 58, 76, 180), width=2)
    for y in range(56, 221, 33):
        draw.line((36, y, 220, y), fill=(44, 58, 76, 180), width=2)

    font = load_font(104)
    text = "E7"
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    x = (SIZE - tw) / 2 - box[0]
    y = (SIZE - th) / 2 - box[1] - 6
    draw.text((x + 2, y + 3), text, font=font, fill=(0, 0, 0, 120))
    draw.text((x, y), text, font=font, fill=GOLD_LIGHT)

    draw.line((58, 196, 198, 196), fill=GOLD, width=5)
    return image


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image = make_image()
    image.save(OUT_DIR / "icon.png")
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    image.save(OUT_DIR / "icon.ico", sizes=sizes)
    print("Wrote", OUT_DIR / "icon.png")
    print("Wrote", OUT_DIR / "icon.ico")


if __name__ == "__main__":
    main()
