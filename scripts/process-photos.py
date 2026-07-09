"""Подготовка фото базы для сайта: кроп, яркость, контраст, ресайз."""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT
OUT = ROOT / "public" / "images"


def load(name: str) -> Image.Image:
    return Image.open(SRC / name).convert("RGB")


def crop_pct(img: Image.Image, left=0, top=0, right=0, bottom=0) -> Image.Image:
    w, h = img.size
    return img.crop((int(w * left), int(h * top), int(w * (1 - right)), int(h * (1 - bottom))))


def enhance(img: Image.Image, *, bright=1.14, contrast=1.12, color=1.2, sharp=1.25) -> Image.Image:
    img = ImageEnhance.Brightness(img).enhance(bright)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Color(img).enhance(color)
    img = ImageEnhance.Sharpness(img).enhance(sharp)
    return img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=90, threshold=3))


def save(img: Image.Image, name: str, max_w: int, upscale: float = 1.0) -> None:
    if upscale > 1:
        img = img.resize(
            (int(img.width * upscale), int(img.height * upscale)),
            Image.Resampling.LANCZOS,
        )
    if img.width > max_w:
        ratio = max_w / img.width
        img = img.resize((max_w, int(img.height * ratio)), Image.Resampling.LANCZOS)
    path = OUT / name
    img.save(path, "JPEG", quality=88, optimize=True)
    print(f"  -> {path.name} ({img.size[0]}x{img.size[1]})")


def process():
    OUT.mkdir(parents=True, exist_ok=True)

    jobs = [
        # Hero — ряд домиков, минимальный кроп
        (
            "hero.jpg",
            "0ULZukKYPQK3lYkCjzjREFjLMQ4M5XpWr__hZKwPrWLyCuNIqBAbg27KiEGNn1dJXBQ-aoCQSdcLBrFXlHIhn1VW.jpg",
            {"crop": (0, 0.02, 0, 0.28), "max_w": 1280, "upscale": 2, "bright": 1.15, "color": 1.25},
        ),
        # Блок «О базе»
        (
            "overview.jpg",
            "h_BgCC4v805-0eX9zWXontA2O8vktACIk9A_0fBZbzGydUmLADHYRCjuGvFCLFtCTDCFVeJolfTyrqV90Nw8gybk.jpg",
            {"crop": (0, 0, 0.08, 0.12), "max_w": 1000, "upscale": 2},
        ),
        ("house-1.jpg", "h_BgCC4v805-0eX9zWXontA2O8vktACIk9A_0fBZbzGydUmLADHYRCjuGvFCLFtCTDCFVeJolfTyrqV90Nw8gybk.jpg", {"crop": (0, 0, 0.05, 0.1), "max_w": 640, "upscale": 1.5}),
        ("house-2.jpg", "5IU5G1BgtvlgB0a0ORgcYNQlqsRTXrYrhAN8zpw5myATZD9Mf3IBHetvdccXWfH-4RgIGfN7K38IuAaj6VLak9Ae.jpg", {"crop": (0, 0, 0.05, 0.12), "max_w": 640, "upscale": 1.5}),
        ("house-3.jpg", "gTKAjugspn-uXlB3Yc7dzi0AVL1RutpZr826iWyV3FnZnu4flV9JZ9KxljimtE5q39nNhb11ox60qNwqnRMsrOB4.jpg", {"crop": (0, 0, 0.05, 0.1), "max_w": 640, "upscale": 1.5}),
        ("house-4.jpg", "lBzbTdnTqy3R29ZoK37tkcVRuUgHW31glwYDVCgFcd1ts_hAQPHaHEbhrjcTLs6ZOlpdhGZZj4WwYFjvwZMiEEA_.jpg", {"crop": (0, 0, 0.05, 0.1), "max_w": 640, "upscale": 1.5}),
        ("house-5.jpg", "5Aaqy8AcCPS8FdP4btn5q16j5faYPcN-r3rlq7i3bt8toq80rAGFcpQOwnEHj0rgalGJXDsMHaytILBf2Gglrw3I.jpg", {"crop": (0.05, 0, 0.05, 0.28), "max_w": 640, "upscale": 1.5}),
        ("house-6.jpg", "hd9hb8MGQIQ4H2wXk6c2nWAszWRSnysdSTBvRqfiDfThjLcKspPZgnFeT9HKgeDSJ_l-xBfefXVPYH1_QDWZ-m6B.jpg", {"crop": (0, 0.02, 0, 0.28), "max_w": 640, "upscale": 1.5}),
        ("house-7.jpg", "inQ777vYcSb5jKfbx8v_chL2znPFkSYRjwoFvEOGPpFyqatKm408LGRE96BtlvSoBVYBPhMsLDmQ7aOHJkxwkaq3.jpg", {"crop": (0, 0, 0.1, 0.1), "max_w": 640, "upscale": 1.5, "bright": 1.18}),
        ("house-8.jpg", "zZpbfR86P_2D_L9_ex_NCASDcIK6E77bny-jgtnvAmzCDR6vpeoR0QaPLzgz-m0qjgzt76gVXE5K0cJYIMtXcGWC.jpg", {"crop": (0.03, 0.02, 0.03, 0.3), "max_w": 640, "upscale": 1.5}),
        ("house-9.jpg", "1ePUzt5zi5qw1Xg7qDFOucPsCWoYMOlBgJcSQWMZawJISPC3K3Ca-QHxpLZORaKw5JR4-BL4Cj1HuZbg3dqxrMFu.jpg", {"crop": (0, 0.02, 0, 0.28), "max_w": 640, "upscale": 1.5}),
    ]

    for out_name, src_name, opts in jobs:
        print(f"Processing {src_name[:20]}...")
        img = load(src_name)
        c = opts.get("crop", (0, 0, 0, 0))
        img = crop_pct(img, *c)
        img = enhance(
            img,
            bright=opts.get("bright", 1.14),
            contrast=opts.get("contrast", 1.12),
            color=opts.get("color", 1.2),
            sharp=opts.get("sharp", 1.25),
        )
        save(img, out_name, opts["max_w"], opts.get("upscale", 1))

    print("Done.")


if __name__ == "__main__":
    process()
