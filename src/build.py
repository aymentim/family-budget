"""Builds public/index.html from src/app.html (the same page used for the online demo), switching it to the shared live mode."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "src" / "app.html").read_text(encoding="utf-8")
cut = src.index("</style>") + len("</style>")
head_part, body_part = src[:cut], src[cut:]
page = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="budget-live" content="1">
<meta name="theme-color" content="#1F5FD1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="الميزانية">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon-v2.png">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font-size:14px}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head_part}
</head>
<body>
{body_part}
</body>
</html>
"""
(root / "public" / "index.html").write_text(page, encoding="utf-8")
print("built public/index.html", len(page), "bytes")
