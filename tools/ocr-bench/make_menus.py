"""
Draws drinks menus for the menu bench (score_menus.mts), made to look
photographed: tilt and perspective, a table around the paper, uneven light,
blur, noise and JPEG compression.

Three kinds, 20 in all:
  - gluten-free beers among ordinary ones,
  - gluten-free beers next to their look-alikes with gluten (Estrella Damm
    and Daura Damm, Peroni and Peroni Gluten Free, Punk IPA and Gluten-Free
    Punk IPA),
  - no gluten-free beer at all, only look-alikes and generic names ("House
    IPA", "Blonde") that must not match.

A file is named after the beers of our list its menu identifies (full name,
brewery and name on one line, or a short name in MENU_SHORT_NAMES), joined by
" + ", or "none"; then " - generated NN <style>". Writes to images/menus/.

    tools/ocr-bench/.venv/bin/python tools/ocr-bench/make_menus.py
"""
import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).parent
OUT = HERE / 'images' / 'menus'
URW = Path('/usr/share/fonts/opentype/urw-base35')
TTF = Path('/usr/share/fonts/truetype')


def font_path(name: str) -> str:
    for base in (URW, TTF):
        hits = list(base.rglob(name))
        if hits:
            return str(hits[0])
    raise FileNotFoundError(name)


FONTS = {
    'serif': ('C059-Roman.otf', 'C059-Bold.otf', 'C059-Italic.otf'),
    'palatino': ('P052-Roman.otf', 'P052-Bold.otf', 'P052-Italic.otf'),
    'sans': ('LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf'),
    'condensed': ('IBMPlexSansCondensed-Regular.ttf', 'IBMPlexSansCondensed-Bold.ttf', 'IBMPlexSansCondensed-Italic.ttf'),
    'lato': ('Lato-Regular.ttf', 'Lato-Black.ttf', 'Lato-Italic.ttf'),
    'mono': ('IBMPlexMono-Regular.ttf', 'IBMPlexMono-Bold.ttf', 'IBMPlexMono-Italic.ttf'),
    'script': ('Z003-MediumItalic.otf', 'Z003-MediumItalic.otf', 'Z003-MediumItalic.otf'),
    'bookman': ('URWBookman-Light.otf', 'URWBookman-Demi.otf', 'URWBookman-LightItalic.otf'),
}

# (name as printed, detail line or None, price)
Item = tuple[str, str | None, str]

MENUS: list[dict] = [
    # Gluten-free beers among ordinary ones.
    dict(expected=['Peroni Nastro Azzurro Gluten Free', 'Vagabond Pale Ale'], style='pub', fonts='serif', title='THE CROWN & ANCHOR',
         sections=[('ON DRAUGHT', [('Guinness', 'Irish stout 4.2%', '5.90'), ('Camden Hells', 'Lager 4.6%', '6.40'), ('Beavertown Neck Oil', 'Session IPA 4.3%', '6.70')]),
                   ('BOTTLES & CANS', [('Peroni Nastro Azzurro Gluten Free', '330ml 5.1%', '5.20'), ('Brewdog Vagabond Pale Ale', 'Gluten free 330ml 4.5%', '5.50'), ('Corona Extra', '330ml 4.5%', '5.00')])]),
    dict(expected=['Glutenberg IPA', 'Omission Lager'], style='chalk', fonts='script', title='Beers today',
         sections=[('Taps', [('Brooklyn Lager', None, '6'), ('Sierra Nevada Pale Ale', None, '7')]),
                   ('Gluten free', [('Glutenberg IPA', None, '7'), ('Omission Lager', None, '6')])]),
    dict(expected=['Mahou Cinco Estrellas Sin Gluten', 'Cruzcampo Especial Sin Gluten'], style='spanish', fonts='bookman', title='CERVEZAS',
         sections=[('Botellines', [('Alhambra Reserva 1925', '33 cl', '3,20 €'), ('Mahou Cinco Estrellas Sin Gluten', '33 cl', '2,90 €'), ('Cruzcampo Especial Sin Gluten', '33 cl', '2,80 €'), ('Coronita', '35,5 cl', '2,90 €')])]),
    dict(expected=['Stella Artois Gluten Free'], style='restaurant', fonts='palatino', title='Beer',
         sections=[('', [('Asahi Super Dry', 'Crisp Japanese rice lager, 5.2%', '6.00'), ('Birra Moretti', 'Italian lager with a malty finish, 4.6%', '5.80'),
                         ('Stella Artois Gluten Free', 'The Belgian pilsner, brewed to be gluten free, 4.6%', '5.80'), ('Erdinger Weissbier', 'Bavarian wheat beer, 5.3%', '6.20')])]),
    dict(expected=['Mongozo Premium Pilsener', 'Brunehaut Bio Blonde', 'Lakefront New Grist'], style='table', fonts='condensed', title='BOTTLED BEER',
         sections=[('', [('Heineken', 'Lager | 5.0% | 330ml', '4.80'), ('Leffe Blonde', 'Abbey | 6.6% | 330ml', '5.90'), ('Mongozo Premium Pilsener', 'Pilsner GF | 5.0% | 330ml', '5.50'),
                         ('Brunehaut Bio Blonde', 'Blonde GF | 6.5% | 330ml', '6.20'), ('Lakefront New Grist', 'Sorghum GF | 5.1% | 355ml', '6.00'), ('Duvel', 'Strong golden | 8.5% | 330ml', '6.90')])]),
    dict(expected=['Jubel Peach', 'Jubel Lemon', 'Laitilan Kukko Pils'], style='centered', fonts='lato', title='DRINKS',
         sections=[('Beer & Cider', [('Jubel Peach', 'gluten free', '5.5'), ('Jubel Lemon', 'gluten free', '5.5'), ('Laitilan Kukko Pils', None, '6'), ('Aspall Cyder', None, '5.5')])]),
    dict(expected=['Stellaris Gluten-Free Pilsner'], style='pub', fonts='sans', title='ÖL / BEER',
         sections=[('Fat / Draught', [('Mariestads Export', '40 cl', '79 kr'), ('Omnipollo Zodiak IPA', '40 cl', '95 kr')]),
                   ('Flaska / Bottle', [('Omnipollo Stellaris Gluten-Free Pilsner', '33 cl', '79 kr'), ('Sofiero Original', '33 cl', '59 kr')])]),

    # Gluten-free beers next to their look-alikes.
    dict(expected=['Daura Damm'], style='spanish', fonts='serif', title='Cervezas',
         sections=[('Barril', [('Estrella Damm (caña)', None, '2,50 €'), ('Voll-Damm (tercio)', None, '3,20 €')]),
                   ('Botella', [('Estrella Damm', '33 cl', '2,80 €'), ('Daura Damm', 'sin gluten 33 cl', '3,00 €'), ('Free Damm 0,0', '33 cl', '2,80 €')])]),
    dict(expected=['Peroni Nastro Azzurro Gluten Free'], style='restaurant', fonts='palatino', title='Birre',
         sections=[('', [('Peroni Nastro Azzurro', 'Draught lager, 5.0%', '5.50'), ('Peroni Gran Riserva Rossa', 'Red lager, 5.2%', '6.20'),
                         ('Peroni Nastro Azzurro 0.0%', 'Alcohol free', '4.50'), ('Peroni Gluten Free', 'Gluten free lager, 5.1%', '5.50')])]),
    dict(expected=['Stella Artois Gluten Free'], style='table', fonts='sans', title='BELGIAN BEERS',
         sections=[('', [('Stella Artois', 'Pilsner | 4.6% | Pint', '6.20'), ('Stella Artois Gluten Free', 'Pilsner | 4.6% | 330ml', '5.40'),
                         ('Hoegaarden', 'Wit | 4.9% | Pint', '6.60'), ('Leffe Brune', 'Abbey | 6.5% | 330ml', '5.90')])]),
    dict(expected=['Gluten-Free Punk IPA', 'Vagabond Pale Ale'], style='chalk', fonts='script', title='On tap',
         sections=[('BrewDog', [('BrewDog Punk IPA', None, '6.5'), ('BrewDog Hazy Jane', None, '6.5'), ('BrewDog Elvis Juice', None, '6.9')]),
                   ('Cans', [('BrewDog Punk IPA Gluten Free', None, '5'), ('BrewDog Vagabond', None, '5')])]),
    dict(expected=['Estrella Galicia Gluten Free'], style='spanish', fonts='condensed', title='CERVEZAS GALLEGAS',
         sections=[('', [('Estrella Galicia Especial', 'Caña', '2,40 €'), ('1906 Reserva Especial', 'Botella 33 cl', '3,10 €'),
                         ('Estrella Galicia 0,0', 'Botella 25 cl', '2,50 €'), ('Estrella Galicia Gluten Free', 'Botella 33 cl', '2,90 €')])]),
    dict(expected=['Greene King IPA Gluten Free', 'Old Speckled Hen Gluten Free'], style='pub', fonts='bookman', title='THE KING\'S HEAD',
         sections=[('Cask Ales', [('Greene King IPA', '3.6%', '4.60'), ('Old Speckled Hen', '5.0%', '5.10'), ('Abbot Ale', '5.0%', '5.20')]),
                   ('Bottles', [('Greene King IPA Gluten Free', '500ml 4.1%', '5.00'), ('Old Speckled Hen Gluten Free', '500ml 5.0%', '5.20')])]),
    dict(expected=['San Miguel Gluten Free', 'Mahou Cinco Estrellas Sin Gluten'], style='table', fonts='mono', title='CERVEZAS',
         sections=[('', [('San Miguel Especial', 'tercio', '2,60'), ('San Miguel 0,0', 'tercio', '2,40'), ('San Miguel Gluten Free', 'tercio', '2,80'),
                         ('Mahou Cinco Estrellas', 'caña', '2,20'), ('Mahou Cinco Estrellas Sin Gluten', 'tercio', '2,80')])]),
    dict(expected=['Ambar Especial Sin Gluten'], style='centered', fonts='serif', title='Cervezas de Zaragoza',
         sections=[('', [('Ambar Especial', 'Caña o tercio', '2,30 €'), ('Ambar 1900', 'Tercio', '2,90 €'), ('Ambar Especial Sin Gluten', 'Tercio', '2,70 €'), ('Cruzcampo', 'Caña', '2,10 €')])]),
    dict(expected=['Daura Damm', 'Damm Daura Marzen'], style='restaurant', fonts='lato', title='Cerveses',
         sections=[('', [('Estrella Damm', 'La cervesa de Barcelona, 5,4%', '3,00'), ('Estrella Damm Daura', 'Sense gluten, 5,4%', '3,40'),
                         ('Damm Daura Märzen', 'Sense gluten, 6,0%', '3,60'), ('Voll-Damm Doble Malta', '7,2%', '3,60')])]),

    # No gluten-free beer: look-alikes and generic names only.
    dict(expected=[], style='spanish', fonts='palatino', title='Cervezas',
         sections=[('', [('Estrella Damm', 'caña', '2,50 €'), ('Voll-Damm', 'tercio', '3,20 €'), ('Estrella Galicia', 'caña', '2,40 €'),
                         ('Mahou Cinco Estrellas', 'tercio', '2,80 €'), ('Ambar Especial', 'tercio', '2,60 €'), ('Cruzcampo', 'caña', '2,10 €')])]),
    dict(expected=[], style='chalk', fonts='script', title='Craft taps',
         sections=[('', [('House IPA', None, '6'), ('Pale Ale', None, '5.5'), ('Blonde', None, '5'), ('Double IPA', None, '7.5'), ('Stout', None, '6'),
                         ('Session IPA', None, '5.5'), ('Gose', None, '6'), ('White', None, '5.5')])]),
    dict(expected=[], style='restaurant', fonts='serif', title='Birre',
         sections=[('', [('Peroni Nastro Azzurro', 'Lager, 5.0%', '5.50'), ('Peroni Capri', 'Lager, 4.2%', '5.20'), ('Birra Moretti', 'Lager, 4.6%', '5.50'),
                         ('Menabrea Bionda', 'Lager, 4.8%', '5.80'), ('Peroni 0.0%', 'Alcohol free', '4.20')])]),
    dict(expected=[], style='pub', fonts='condensed', title='THE RED LION',
         sections=[('Draught', [('BrewDog Punk IPA', '5.4%', '6.40'), ('BrewDog Hazy Jane', '5.0%', '6.40'), ('Stella Artois', '4.6%', '5.80')]),
                   ('Bottles', [('Old Speckled Hen', '5.0%', '5.20'), ('Greene King IPA', '3.6%', '4.60'), ('St Peter\'s Golden Ale', '4.7%', '5.40')])]),
]

STYLES = {
    # paper colour, ink, accent, layout
    'pub': ((248, 244, 232), (30, 30, 30), (120, 20, 20), 'columns'),
    'chalk': ((40, 44, 42), (235, 235, 228), (240, 220, 150), 'list'),
    'spanish': ((252, 250, 245), (40, 30, 25), (170, 40, 30), 'dots'),
    'restaurant': ((255, 255, 255), (20, 20, 20), (90, 90, 90), 'described'),
    'table': ((250, 250, 250), (25, 25, 25), (30, 70, 120), 'table'),
    'centered': ((236, 230, 220), (35, 35, 35), (60, 90, 60), 'centered'),
}


def draw_menu(menu: dict, rng: random.Random) -> Image.Image:
    paper, ink, accent, layout = STYLES[menu['style']]
    regular, bold, italic = (font_path(f) for f in FONTS[menu['fonts']])
    scale = 1.25 if menu['fonts'] == 'script' else 1.0
    W, H = 1400, 1900
    img = Image.new('RGB', (W, H), paper)
    d = ImageDraw.Draw(img)
    f = lambda path, size: ImageFont.truetype(path, int(size * scale))
    title_font, head_font, item_font, small_font = f(bold, 78), f(bold, 46), f(regular, 40), f(italic, 30)
    margin = 110
    y = 120
    tw = d.textlength(menu['title'], font=title_font)
    d.text(((W - tw) / 2, y), menu['title'], fill=accent, font=title_font)
    y += int(150 * scale)

    def item_line(x0: int, x1: int, y: int, name: str, price: str, dots: bool):
        d.text((x0, y), name, fill=ink, font=item_font)
        pw = d.textlength(price, font=item_font)
        d.text((x1 - pw, y), price, fill=ink, font=item_font)
        if dots:
            start = x0 + d.textlength(name, font=item_font) + 12
            dx = start
            while dx < x1 - pw - 16:
                d.text((dx, y), '.', fill=ink, font=item_font)
                dx += 14

    if layout == 'columns':
        col_w = (W - 2 * margin - 60) // 2
        x_cols = [margin, margin + col_w + 60]
        for col, (heading, items) in enumerate(menu['sections'][:2]):
            yy = y
            x0 = x_cols[col % 2]
            d.text((x0, yy), heading, fill=accent, font=head_font)
            yy += int(80 * scale)
            for name, detail, price in items:
                for line in wrap(d, name, item_font, col_w - 120):
                    d.text((x0, yy), line, fill=ink, font=item_font)
                    yy += int(50 * scale)
                d.text((x0 + col_w - d.textlength(price, font=item_font), yy - int(50 * scale)), price, fill=ink, font=item_font)
                if detail:
                    d.text((x0, yy), detail, fill=ink, font=small_font)
                    yy += int(44 * scale)
                yy += int(26 * scale)
        return crop_to_content(img, paper)

    for heading, items in menu['sections']:
        if heading:
            hw = d.textlength(heading, font=head_font)
            hx = (W - hw) / 2 if layout == 'centered' else margin
            d.text((hx, y), heading, fill=accent, font=head_font)
            y += int(85 * scale)
            if layout in ('table', 'dots'):
                d.line((margin, y - 18, W - margin, y - 18), fill=accent, width=3)
        for name, detail, price in items:
            if layout == 'centered':
                line = f'{name}  {price}'
                lw = d.textlength(line, font=item_font)
                d.text(((W - lw) / 2, y), line, fill=ink, font=item_font)
                y += int(52 * scale)
                if detail:
                    dw = d.textlength(detail, font=small_font)
                    d.text(((W - dw) / 2, y), detail, fill=ink, font=small_font)
                    y += int(46 * scale)
                y += int(22 * scale)
            elif layout == 'table':
                d.text((margin, y), name, fill=ink, font=item_font)
                if detail:
                    d.text((margin + 640, y + 6), detail, fill=ink, font=small_font)
                pw = d.textlength(price, font=item_font)
                d.text((W - margin - pw, y), price, fill=ink, font=item_font)
                y += int(62 * scale)
                d.line((margin, y - 10, W - margin, y - 10), fill=(200, 200, 200), width=1)
            elif layout == 'described':
                item_line(margin, W - margin, y, name, price, False)
                y += int(52 * scale)
                if detail:
                    d.text((margin, y), detail, fill=accent, font=small_font)
                    y += int(48 * scale)
                y += int(30 * scale)
            else:  # 'dots', 'list'
                item_line(margin, W - margin, y, name, price, layout == 'dots')
                y += int(54 * scale)
                if detail:
                    d.text((margin + 20, y), detail, fill=ink, font=small_font)
                    y += int(44 * scale)
                y += int(18 * scale)
        y += int(40 * scale)
    return crop_to_content(img, paper)


def crop_to_content(img: Image.Image, paper: tuple) -> Image.Image:
    """The page cut off below its last line, as a menu's text fills its page."""
    bbox = ImageChops.difference(img, Image.new('RGB', img.size, paper)).getbbox()
    return img.crop((0, 0, img.width, min(img.height, bbox[3] + 110))) if bbox else img


def wrap(d: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    words, lines, line = text.split(), [], ''
    for w in words:
        trial = f'{line} {w}'.strip()
        if d.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    return lines + [line]


def photograph(menu_img: Image.Image, rng: random.Random) -> np.ndarray:
    """The menu on a table, shot at a slight angle in uneven light."""
    paper = cv2.cvtColor(np.array(menu_img), cv2.COLOR_RGB2BGR)
    h, w = paper.shape[:2]
    W, H = int(w * 1.35), int(h * 1.25)
    table = np.full((H, W, 3), rng.choice([(60, 80, 110), (35, 45, 60), (120, 130, 140), (30, 30, 30)]), np.uint8)
    table = cv2.add(table, np.random.default_rng(rng.randrange(1 << 30)).integers(0, 25, (H, W, 3), dtype=np.uint8))
    ox, oy = (W - w) / 2, (H - h) / 2
    j = lambda: rng.uniform(-0.05, 0.05)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[ox + j() * w, oy + j() * h], [ox + w + j() * w, oy + j() * h], [ox + w + j() * w, oy + h + j() * h], [ox + j() * w, oy + h + j() * h]])
    angle = np.deg2rad(rng.uniform(-6, 6))
    c = np.float32([W / 2, H / 2])
    rot = np.float32([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    dst = (dst - c) @ rot.T + c
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(paper, M, (W, H))
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), M, (W, H))
    photo = np.where(mask[..., None] > 0, warped, table)
    # Light falling off from one side.
    gx, gy = np.meshgrid(np.linspace(0, 1, W), np.linspace(0, 1, H))
    fx, fy = rng.uniform(-1, 1), rng.uniform(-1, 1)
    light = 1.0 - rng.uniform(0.15, 0.4) * np.clip(gx * fx + gy * fy + 0.5, 0, 1.5) / 1.5
    photo = np.clip(photo.astype(np.float32) * light[..., None], 0, 255)
    photo += np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(2, 7), photo.shape)
    photo = np.clip(photo, 0, 255).astype(np.uint8)
    sigma = rng.uniform(0.3, 1.4)
    photo = cv2.GaussianBlur(photo, (0, 0), sigma)
    # Phone-photo size.
    target = rng.choice([2400, 3000, 4000])
    s = target / max(W, H)
    photo = cv2.resize(photo, (int(W * s), int(H * s)), interpolation=cv2.INTER_CUBIC)
    ok, jpg = cv2.imencode('.jpg', photo, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(70, 92)])
    return cv2.imdecode(jpg, cv2.IMREAD_COLOR)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('* - generated *'):
        old.unlink()
    rng = random.Random(2026)
    for i, menu in enumerate(MENUS, 1):
        name = ' + '.join(menu['expected']) or 'none'
        path = OUT / f'{name} - generated {i:02d} {menu["style"]}.jpg'
        cv2.imwrite(str(path), photograph(draw_menu(menu, rng), rng), [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(path.name)


if __name__ == '__main__':
    main()
