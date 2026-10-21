# Makes the page background around phone screenshots transparent (flood fill from the corners only).
import sys, os
from PIL import Image, ImageDraw
src, dst = 'screenshots', 'build'
for f in ['01-ussd-menu.png','02-ussd-answer.png','03-sms-alert.png','04-leader-plant-tiles.png','05-leader-sell-card.png','07b-farmer-paid-sms.png']:
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    w, h = im.size
    for pt in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
        ImageDraw.floodfill(im, pt, (255,255,255,0), thresh=6)
    im.save(os.path.join(dst, f)); print('cut', f, im.getpixel((0,0)))
