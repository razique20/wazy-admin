#!/usr/bin/env python3
"""
Generate complete mobile app icon package and transparent PNG logos for Finavig.
Includes:
- iOS AppIcon.appiconset with Contents.json
- Android mipmap densities + Google Play Store 512x512 + Adaptive icons
- Transparent PNG logos (emblem mark, full logo, horizontal logo)
- Splash screens (iOS & Android)
- Web favicons and site.webmanifest
"""

import os
import json
from PIL import Image, ImageDraw, ImageFilter

SOURCE_IMAGE = "/Users/raziquemk/.gemini/antigravity-ide/brain/2d04c6cc-bb0e-4d3f-952e-48c6501ec8df/finavig_logo_1792321999666.jpg"
PUBLIC_DIR = "/Users/raziquemk/Desktop/finavig-admin/public"
OUTPUT_DIR = os.path.join(PUBLIC_DIR, "mobile-assets")

def make_transparent(img, threshold=12, soft=18):
    """Converts white background to smooth antialiased alpha transparency."""
    img = img.convert("RGBA")
    data = img.getdata()
    new_data = []
    for item in data:
        r, g, b, a = item
        diff = 255 - min(r, g, b)
        if diff <= threshold:
            new_data.append((r, g, b, 0))
        elif diff < (threshold + soft):
            alpha = int((diff - threshold) / float(soft) * 255)
            new_data.append((r, g, b, alpha))
        else:
            new_data.append((r, g, b, 255))
    res = Image.new("RGBA", img.size)
    res.putdata(new_data)
    return res

def create_circular_icon(img):
    """Crops an image into a smooth circular mask for Android round icons."""
    size = img.size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0) + size, fill=255)
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output.paste(img, (0, 0))
    output.putalpha(mask)
    return output

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 1. Load source image
    print(f"Loading source logo from {SOURCE_IMAGE}...")
    src = Image.open(SOURCE_IMAGE).convert("RGBA")
    
    # Emblem bounding box: (297, 184, 727, 614)
    # Give a tiny margin: (292, 179, 732, 619)
    emblem_crop = src.crop((292, 179, 732, 619))
    emblem_trans = make_transparent(emblem_crop)
    
    # Text crop: (210, 665, 814, 855)
    text_crop = src.crop((210, 665, 814, 855))
    text_trans = make_transparent(text_crop)
    
    # Full transparent logo
    full_trans = make_transparent(src)
    
    # -------------------------------------------------------------------------
    # PNG LOGO SUITE
    # -------------------------------------------------------------------------
    png_logos_dir = os.path.join(OUTPUT_DIR, "png-logos")
    os.makedirs(png_logos_dir, exist_ok=True)
    
    # 1. Full transparent logo
    full_trans_path = os.path.join(png_logos_dir, "finavig-logo-transparent.png")
    full_trans.save(full_trans_path, "PNG", optimize=True)
    full_trans.save(os.path.join(PUBLIC_DIR, "finavig-logo-transparent.png"), "PNG", optimize=True)
    print("✓ Saved full transparent logo")
    
    # 2. Standalone emblem mark (transparent)
    mark_trans_path = os.path.join(png_logos_dir, "finavig-mark-transparent.png")
    emblem_trans.save(mark_trans_path, "PNG", optimize=True)
    emblem_trans.save(os.path.join(PUBLIC_DIR, "finavig-mark-transparent.png"), "PNG", optimize=True)
    print("✓ Saved standalone transparent emblem mark")
    
    # 3. Horizontal layout logo (Ideal for mobile top app bar headers)
    # Width 800, Height 200: icon on left, text on right
    horiz_w, horiz_h = 960, 260
    horiz_img = Image.new("RGBA", (horiz_w, horiz_h), (0, 0, 0, 0))
    # Resize emblem to height 200
    emb_scaled = emblem_trans.resize((200, 200), Image.Resampling.LANCZOS)
    horiz_img.paste(emb_scaled, (30, 30), emb_scaled)
    # Resize text to height ~130
    txt_aspect = text_trans.width / float(text_trans.height)
    txt_target_h = 140
    txt_target_w = int(txt_target_h * txt_aspect)
    txt_scaled = text_trans.resize((txt_target_w, txt_target_h), Image.Resampling.LANCZOS)
    horiz_img.paste(txt_scaled, (260, 60), txt_scaled)
    horiz_img.save(os.path.join(png_logos_dir, "finavig-horizontal-logo.png"), "PNG", optimize=True)
    horiz_img.save(os.path.join(PUBLIC_DIR, "finavig-horizontal-logo.png"), "PNG", optimize=True)
    print("✓ Saved horizontal app bar logo")
    
    # -------------------------------------------------------------------------
    # MASTER 1024x1024 APP ICONS (iOS & Android Base)
    # -------------------------------------------------------------------------
    # Standard iOS App Store icon (1024x1024, pure solid background, no transparency)
    # Emblem centered with 20% safe margin padding (650x650 emblem)
    master_icon_white = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
    emblem_650 = emblem_trans.resize((660, 660), Image.Resampling.LANCZOS)
    offset = ((1024 - 660) // 2, (1024 - 660) // 2)
    master_icon_white.paste(emblem_650, offset, emblem_650)
    
    # Dark mode variant
    master_icon_dark = Image.new("RGBA", (1024, 1024), (15, 23, 42, 255)) # #0F172A
    master_icon_dark.paste(emblem_650, offset, emblem_650)
    
    master_icon_white.save(os.path.join(png_logos_dir, "finavig-mark-white-bg.png"), "PNG", optimize=True)
    master_icon_dark.save(os.path.join(png_logos_dir, "finavig-mark-dark-bg.png"), "PNG", optimize=True)
    print("✓ Saved master 1024x1024 icons")
    
    # -------------------------------------------------------------------------
    # iOS APPICONSET (Apple Xcode Asset Catalog)
    # -------------------------------------------------------------------------
    ios_dir = os.path.join(OUTPUT_DIR, "ios", "AppIcon.appiconset")
    os.makedirs(ios_dir, exist_ok=True)
    
    ios_sizes = [
        ("icon-1024x1024.png", 1024, "1024x1024", "ios-marketing", "1x"),
        ("icon-180x180.png", 180, "60x60", "iphone", "3x"),
        ("icon-120x120.png", 120, "60x60", "iphone", "2x"),
        ("icon-167x167.png", 167, "83.5x83.5", "ipad", "2x"),
        ("icon-152x152.png", 152, "76x76", "ipad", "2x"),
        ("icon-87x87.png", 87, "29x29", "iphone", "3x"),
        ("icon-80x80.png", 80, "40x40", "iphone", "2x"),
        ("icon-58x58.png", 58, "29x29", "iphone", "2x"),
        ("icon-40x40.png", 40, "40x40", "ipad", "1x"),
        ("icon-29x29.png", 29, "29x29", "ipad", "1x"),
        ("icon-20x20.png", 20, "20x20", "iphone", "1x"),
    ]
    
    contents_images = []
    for filename, size, pt_size, idiom, scale in ios_sizes:
        resized = master_icon_white.resize((size, size), Image.Resampling.LANCZOS)
        # iOS App Store guidelines require no alpha transparency on master store icons
        rgb_img = Image.new("RGB", (size, size), (255, 255, 255))
        rgb_img.paste(resized, (0, 0), resized)
        rgb_img.save(os.path.join(ios_dir, filename), "PNG", optimize=True)
        contents_images.append({
            "size": pt_size,
            "idiom": idiom,
            "filename": filename,
            "scale": scale
        })
    
    # Write Contents.json for Xcode
    contents_json = {
        "images": contents_images,
        "info": {
            "version": 1,
            "author": "xcode"
        }
    }
    with open(os.path.join(ios_dir, "Contents.json"), "w") as f:
        json.dump(contents_json, f, indent=2)
    print("✓ Generated iOS AppIcon.appiconset with Contents.json")
    
    # -------------------------------------------------------------------------
    # ANDROID MIPMAPS & GOOGLE PLAY STORE
    # -------------------------------------------------------------------------
    android_dir = os.path.join(OUTPUT_DIR, "android")
    os.makedirs(android_dir, exist_ok=True)
    
    # Google Play Store 512x512
    playstore_icon = master_icon_white.resize((512, 512), Image.Resampling.LANCZOS)
    playstore_icon.save(os.path.join(android_dir, "playstore-512x512.png"), "PNG", optimize=True)
    
    android_densities = [
        ("mipmap-xxxhdpi", 192),
        ("mipmap-xxhdpi", 144),
        ("mipmap-xhdpi", 96),
        ("mipmap-hdpi", 72),
        ("mipmap-mdpi", 48),
    ]
    
    for folder, size in android_densities:
        folder_path = os.path.join(android_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        # Standard square launcher
        sq = master_icon_white.resize((size, size), Image.Resampling.LANCZOS)
        sq.save(os.path.join(folder_path, "ic_launcher.png"), "PNG", optimize=True)
        # Circular launcher
        round_icon = create_circular_icon(sq)
        round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG", optimize=True)
        
    # Android Adaptive Icon (Foreground: 432x432, Background: 432x432)
    adaptive_dir = os.path.join(android_dir, "adaptive-icon")
    os.makedirs(adaptive_dir, exist_ok=True)
    # Foreground: 432x432 with 216x216 emblem at center
    adaptive_fg = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    emblem_220 = emblem_trans.resize((220, 220), Image.Resampling.LANCZOS)
    adaptive_fg.paste(emblem_220, ((432 - 220) // 2, (432 - 220) // 2), emblem_220)
    adaptive_fg.save(os.path.join(adaptive_dir, "ic_launcher_foreground.png"), "PNG", optimize=True)
    
    adaptive_bg = Image.new("RGB", (432, 432), (255, 255, 255))
    adaptive_bg.save(os.path.join(adaptive_dir, "ic_launcher_background.png"), "PNG", optimize=True)
    print("✓ Generated Android mipmap icons & adaptive icon assets")
    
    # -------------------------------------------------------------------------
    # MOBILE LAUNCH / SPLASH SCREENS
    # -------------------------------------------------------------------------
    splash_dir = os.path.join(OUTPUT_DIR, "splash")
    os.makedirs(splash_dir, exist_ok=True)
    
    # 1. Standalone splash icon (256x256)
    splash_icon = emblem_trans.resize((256, 256), Image.Resampling.LANCZOS)
    splash_icon.save(os.path.join(splash_dir, "splash-icon.png"), "PNG", optimize=True)
    
    # 2. iOS Splash Screen (1242x2688 - standard iPhone Max portrait)
    ios_splash = Image.new("RGBA", (1242, 2688), (255, 255, 255, 255))
    # Place emblem (340x340) centered slightly above middle
    emblem_splash = emblem_trans.resize((340, 340), Image.Resampling.LANCZOS)
    ios_splash.paste(emblem_splash, ((1242 - 340) // 2, 1100), emblem_splash)
    # Place text under emblem
    txt_splash_w = 400
    txt_splash_h = int(txt_splash_w / txt_aspect)
    txt_splash = text_trans.resize((txt_splash_w, txt_splash_h), Image.Resampling.LANCZOS)
    ios_splash.paste(txt_splash, ((1242 - txt_splash_w) // 2, 1490), txt_splash)
    ios_splash.save(os.path.join(splash_dir, "splash-screen-ios.png"), "PNG", optimize=True)
    
    # 3. Android Splash Screen (1080x2400 - standard Android 20:9 portrait)
    android_splash = Image.new("RGBA", (1080, 2400), (255, 255, 255, 255))
    emblem_splash_and = emblem_trans.resize((300, 300), Image.Resampling.LANCZOS)
    android_splash.paste(emblem_splash_and, ((1080 - 300) // 2, 980), emblem_splash_and)
    txt_splash_and = text_trans.resize((360, int(360 / txt_aspect)), Image.Resampling.LANCZOS)
    android_splash.paste(txt_splash_and, ((1080 - 360) // 2, 1330), txt_splash_and)
    android_splash.save(os.path.join(splash_dir, "splash-screen-android.png"), "PNG", optimize=True)
    print("✓ Generated iOS and Android launch splash screens")
    
    # -------------------------------------------------------------------------
    # WEB FAVICONS & PWA MANIFEST
    # -------------------------------------------------------------------------
    # apple-touch-icon.png (180x180)
    apple_icon = master_icon_white.resize((180, 180), Image.Resampling.LANCZOS)
    apple_icon.save(os.path.join(PUBLIC_DIR, "apple-touch-icon.png"), "PNG", optimize=True)
    
    # android-chrome icons
    chrome_192 = master_icon_white.resize((192, 192), Image.Resampling.LANCZOS)
    chrome_192.save(os.path.join(PUBLIC_DIR, "android-chrome-192x192.png"), "PNG", optimize=True)
    chrome_512 = master_icon_white.resize((512, 512), Image.Resampling.LANCZOS)
    chrome_512.save(os.path.join(PUBLIC_DIR, "android-chrome-512x512.png"), "PNG", optimize=True)
    
    # favicon-32x32 & favicon-16x16
    fav_32 = master_icon_white.resize((32, 32), Image.Resampling.LANCZOS)
    fav_32.save(os.path.join(PUBLIC_DIR, "favicon-32x32.png"), "PNG", optimize=True)
    fav_16 = master_icon_white.resize((16, 16), Image.Resampling.LANCZOS)
    fav_16.save(os.path.join(PUBLIC_DIR, "favicon-16x16.png"), "PNG", optimize=True)
    
    # Multi-resolution favicon.ico
    fav_images = [
        master_icon_white.resize((16, 16), Image.Resampling.LANCZOS),
        master_icon_white.resize((32, 32), Image.Resampling.LANCZOS),
        master_icon_white.resize((48, 48), Image.Resampling.LANCZOS),
    ]
    fav_images[0].save(
        os.path.join(PUBLIC_DIR, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=fav_images[1:]
    )
    
    # site.webmanifest for PWA / Mobile Web Apps
    manifest = {
        "name": "finavig Admin",
        "short_name": "finavig",
        "icons": [
            {
                "src": "/android-chrome-192x192.png",
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": "/android-chrome-512x512.png",
                "sizes": "512x512",
                "type": "image/png"
            }
        ],
        "theme_color": "#0078D4",
        "background_color": "#F8FAFC",
        "display": "standalone"
    }
    with open(os.path.join(PUBLIC_DIR, "site.webmanifest"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("✓ Generated multi-res favicon.ico and site.webmanifest")
    print(f"\nAll mobile app assets generated successfully in {OUTPUT_DIR} and {PUBLIC_DIR}!")

if __name__ == "__main__":
    main()
