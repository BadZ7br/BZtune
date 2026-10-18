from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
root.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (256, 256), "#171717")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((14, 14, 242, 242), radius=45, fill="#292929", outline="#ababab", width=5)
font = None
for name in [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]:
    if Path(name).exists():
        font = ImageFont.truetype(name, size=103)
        break
font = font or ImageFont.load_default()
draw.text((128, 124), "BZ", font=font, anchor="mm", fill="#ededed")
image.save(root / "icon.png")
image.save(root / "icon.ico", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
print("Ícones provisórios gerados.")
