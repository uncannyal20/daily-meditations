#!/usr/bin/env python3
"""
Generate high quality PWA app icons and favicons for Devotio Diurna.
Produces:
- assets/icons/icon-512.png (512x512)
- assets/icons/icon-192.png (192x192)
- assets/icons/apple-touch-icon.png (180x180)
- assets/icons/favicon-32.png (32x32)
- favicon.ico (multi-size: 16, 32, 48)
- assets/icons/favicon.svg
"""

import math
import os
from PIL import Image, ImageDraw, ImageFilter


def create_base_icon(size=512):
    # Create image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = size / 2.0
    radius = size * 0.46

    # 1. Background Rounded Squircle / Circle with Burgundy Gradient
    # We will draw a smooth radial gradient
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Corner radius for squircle / app icon
    corner_r = int(size * 0.22)
    # Draw base squircle
    bg_draw.rounded_rectangle(
        [size * 0.04, size * 0.04, size * 0.96, size * 0.96],
        radius=corner_r,
        fill=(105, 18, 18, 255) # Burgundy base
    )

    # Add subtle radial lighting
    for r in range(int(size * 0.6), 0, -6):
        alpha = int(35 * (1.0 - (r / (size * 0.6))))
        # Warm gold/amber highlight in upper-center
        cx = int(center)
        cy = int(center * 0.85)
        bbox = [cx - r, cy - r, cx + r, cy + r]
        bg_draw.ellipse(bbox, fill=(212, 175, 55, alpha))

    # Darker vignette near edges
    vignette = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    v_draw = ImageDraw.Draw(vignette)
    for r in range(int(size * 0.65), int(size * 0.35), -10):
        factor = (r - size * 0.35) / (size * 0.3)
        v_alpha = int(45 * factor)
        v_draw.rounded_rectangle(
            [size * 0.04, size * 0.04, size * 0.96, size * 0.96],
            radius=corner_r,
            outline=(20, 5, 5, v_alpha),
            width=int(size * 0.04)
        )
    bg = Image.alpha_composite(bg, vignette)

    # 2. Outer Monastic Gold Border
    gold_outer = (212, 175, 55, 230)
    gold_inner = (245, 222, 135, 240)
    border_w = max(2, int(size * 0.022))

    bg_draw = ImageDraw.Draw(bg)
    bg_draw.rounded_rectangle(
        [size * 0.055, size * 0.055, size * 0.945, size * 0.945],
        radius=corner_r - int(size * 0.015),
        outline=gold_outer,
        width=border_w
    )

    # Inner decorative gold circle
    inner_circle_r = size * 0.36
    bg_draw.ellipse(
        [center - inner_circle_r, center - inner_circle_r,
         center + inner_circle_r, center + inner_circle_r],
        outline=(190, 150, 45, 140),
        width=max(1, int(size * 0.01))
    )

    # 3. Radiant halo rays behind cross
    num_rays = 16
    for i in range(num_rays):
        angle = (2 * math.pi / num_rays) * i
        r_start = size * 0.12
        r_end = size * 0.34
        x1 = center + r_start * math.cos(angle)
        y1 = center + r_start * math.sin(angle)
        x2 = center + r_end * math.cos(angle)
        y2 = center + r_end * math.sin(angle)
        bg_draw.line([(x1, y1), (x2, y2)], fill=(245, 220, 120, 75), width=max(1, int(size * 0.008)))

    # 4. Sacred Monastic Cross
    # Latin Cross with tapered/flared ends and center diamond
    cross_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cross_draw = ImageDraw.Draw(cross_layer)

    # Cross dimensions
    top_y = size * 0.20
    bottom_y = size * 0.76
    beam_y = size * 0.40
    left_x = size * 0.27
    right_x = size * 0.73

    shaft_w = size * 0.068
    shaft_half = shaft_w / 2.0
    beam_w = size * 0.068
    beam_half = beam_w / 2.0

    # Cross shadow
    shadow_offset = int(size * 0.015)
    shadow_color = (15, 5, 5, 160)
    # Vertical shaft shadow
    cross_draw.rectangle(
        [center - shaft_half + shadow_offset, top_y + shadow_offset,
         center + shaft_half + shadow_offset, bottom_y + shadow_offset],
        fill=shadow_color
    )
    # Horizontal beam shadow
    cross_draw.rectangle(
        [left_x + shadow_offset, beam_y - beam_half + shadow_offset,
         right_x + shadow_offset, beam_y + beam_half + shadow_offset],
        fill=shadow_color
    )

    # Main Gold Cross Fill
    gold_body = (225, 185, 65, 255)
    gold_highlight = (255, 235, 145, 255)
    gold_shadow = (175, 135, 35, 255)

    # Vertical shaft
    cross_draw.rectangle(
        [center - shaft_half, top_y, center + shaft_half, bottom_y],
        fill=gold_body
    )
    # Horizontal beam
    cross_draw.rectangle(
        [left_x, beam_y - beam_half, right_x, beam_y + beam_half],
        fill=gold_body
    )

    # Flared triangular end caps on cross
    flare_len = size * 0.035
    flare_w = size * 0.045

    # Top flare
    cross_draw.polygon([
        (center - shaft_half, top_y),
        (center + shaft_half, top_y),
        (center + shaft_half + flare_w * 0.5, top_y - flare_len),
        (center - shaft_half - flare_w * 0.5, top_y - flare_len)
    ], fill=gold_highlight)

    # Bottom flare
    cross_draw.polygon([
        (center - shaft_half, bottom_y),
        (center + shaft_half, bottom_y),
        (center + shaft_half + flare_w * 0.5, bottom_y + flare_len),
        (center - shaft_half - flare_w * 0.5, bottom_y + flare_len)
    ], fill=gold_shadow)

    # Left flare
    cross_draw.polygon([
        (left_x, beam_y - beam_half),
        (left_x, beam_y + beam_half),
        (left_x - flare_len, beam_y + beam_half + flare_w * 0.5),
        (left_x - flare_len, beam_y - beam_half - flare_w * 0.5)
    ], fill=gold_highlight)

    # Right flare
    cross_draw.polygon([
        (right_x, beam_y - beam_half),
        (right_x, beam_y + beam_half),
        (right_x + flare_len, beam_y + beam_half + flare_w * 0.5),
        (right_x + flare_len, beam_y - beam_half - flare_w * 0.5)
    ], fill=gold_shadow)

    # Center jewel / diamond facet
    diamond_s = size * 0.065
    cross_draw.polygon([
        (center, beam_y - diamond_s),
        (center + diamond_s, beam_y),
        (center, beam_y + diamond_s),
        (center - diamond_s, beam_y)
    ], fill=(255, 245, 185, 255))

    cross_draw.polygon([
        (center, beam_y - diamond_s * 0.5),
        (center + diamond_s * 0.5, beam_y),
        (center, beam_y + diamond_s * 0.5),
        (center - diamond_s * 0.5, beam_y)
    ], fill=(135, 20, 20, 240)) # Ruby center

    # Fine inner gold bevel line
    cross_draw.line(
        [(center - shaft_half * 0.4, top_y), (center - shaft_half * 0.4, bottom_y)],
        fill=gold_highlight, width=max(1, int(size * 0.008))
    )
    cross_draw.line(
        [(left_x, beam_y - beam_half * 0.4), (right_x, beam_y - beam_half * 0.4)],
        fill=gold_highlight, width=max(1, int(size * 0.008))
    )

    # Composite layers
    img = Image.alpha_composite(bg, cross_layer)
    return img


def create_svg_favicon():
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="grad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#8e1a1a"/>
      <stop offset="100%" stop-color="#420d0d"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect x="4" y="4" width="92" height="92" rx="20" fill="url(#grad)" stroke="#d4af37" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="35" fill="none" stroke="#d4af37" stroke-width="0.8" opacity="0.6"/>
  <!-- Cross Shadow -->
  <path d="M48 22h6v54h-6z M27 38h48v6h-48z" fill="#150505" opacity="0.5"/>
  <!-- Gold Cross -->
  <g filter="url(#glow)">
    <!-- Vertical shaft -->
    <path d="M47 20h6v54h-6z" fill="#f3da7c"/>
    <!-- Horizontal beam -->
    <path d="M26 37h48v6h-48z" fill="#f3da7c"/>
    <!-- Flared Ends -->
    <polygon points="46,20 54,20 56,17 44,17" fill="#ffeeb0"/>
    <polygon points="46,74 54,74 56,77 44,77" fill="#c49527"/>
    <polygon points="26,36 26,44 23,45 23,35" fill="#ffeeb0"/>
    <polygon points="74,36 74,44 77,45 77,35" fill="#c49527"/>
    <!-- Center Diamond -->
    <polygon points="50,35 55,40 50,45 45,40" fill="#ffffff"/>
    <polygon points="50,37 53,40 50,43 47,40" fill="#841b1b"/>
  </g>
</svg>"""


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(base_dir, "assets", "icons")
    os.makedirs(icons_dir, exist_ok=True)

    print("Generating base icon at 512x512...")
    icon_512 = create_base_icon(512)
    icon_512.save(os.path.join(icons_dir, "icon-512.png"), "PNG")

    print("Generating 192x192 icon...")
    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(os.path.join(icons_dir, "icon-192.png"), "PNG")

    print("Generating Apple Touch Icon 180x180...")
    icon_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    icon_180.save(os.path.join(icons_dir, "apple-touch-icon.png"), "PNG")

    print("Generating 32x32 Favicon...")
    icon_32 = icon_512.resize((32, 32), Image.Resampling.LANCZOS)
    icon_32.save(os.path.join(icons_dir, "favicon-32.png"), "PNG")

    print("Generating favicon.ico...")
    icon_16 = icon_512.resize((16, 16), Image.Resampling.LANCZOS)
    icon_48 = icon_512.resize((48, 48), Image.Resampling.LANCZOS)
    favicon_path = os.path.join(base_dir, "favicon.ico")
    icon_48.save(favicon_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    # Also save to assets/icons/
    icon_48.save(os.path.join(icons_dir, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

    print("Generating favicon.svg...")
    svg_content = create_svg_favicon()
    with open(os.path.join(icons_dir, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
    with open(os.path.join(base_dir, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)

    print("[SUCCESS] All icons and favicons generated successfully!")


if __name__ == "__main__":
    main()
