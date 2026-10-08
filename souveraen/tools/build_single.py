#!/usr/bin/env python3
"""Baut eine einzelne, eigenständige HTML-Datei aus index.html, CSS und allen Skripten.

  python3 tools/build_single.py              -> dist/souveraen.html (vollständiges HTML-Dokument)
  python3 tools/build_single.py --fragment   -> dist/souveraen-fragment.html (ohne <html>/<head>/<body>,
                                                für Plattformen, die selbst ein Dokumentgerüst ergänzen)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def main():
    fragment = "--fragment" in sys.argv
    html = read("index.html")
    css = read("css/style.css")
    html = html.replace('<link rel="stylesheet" href="css/style.css">', "<style>\n" + css + "\n</style>")

    def inline(m):
        src = m.group(1)
        code = read(src).replace("</script", "<\\/script")
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    if fragment:
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        head = re.sub(r'<meta charset="utf-8">\s*', "", head)
        head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        html = head.strip() + "\n" + body.strip() + "\n"
        out = "dist/souveraen-fragment.html"
    else:
        out = "dist/souveraen.html"
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    with open(os.path.join(ROOT, out), "w", encoding="utf-8") as f:
        f.write(html)
    print(out, len(html.encode("utf-8")) // 1024, "KB")


if __name__ == "__main__":
    main()
