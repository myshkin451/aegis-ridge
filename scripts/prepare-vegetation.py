"""Bake the three scanned rock LODs, four foliage maps and shared near-tree mesh.

python3 scripts/prepare-vegetation.py DIRECTORY
DIRECTORY contains the official source files named in SOURCES below.
Requires the project's npm dependencies plus Python with NumPy and Pillow.
"""
import argparse
import hashlib
import json
import math
import random
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/assets/vegetation'
SOURCES = {
    'boulder_01_1k.gltf': '26e2eef4a1f68c9557c65cd375b21d6c',
    'boulder_01.bin': '27a19fa031d8b4c3a09261f19c444dc5',
    'boulder_01_diff_1k.jpg': '25f8a843f13369d56d37f49db05ea8c3',
    'pine_tree_01_twig_alpha_2k.jpg': '62d321c31d625a3cf786db46b729f8c6',
    'pine_tree_01_twig_diff_2k.jpg': '45d577b1b780711976147d66234a1f4c',
    'grass_medium_01_diff_1k.jpg': '6b18ed50d776fd20c1304d9994bd764e',
    'grass_medium_01_alpha_1k.jpg': 'f1ffbffd4b568bfa72f53649bdfff20b',
    'grass_medium_01_1k.gltf': '28dd8247f3faa749bf87a0b84be01e7e',
    'grass_medium_01.bin': 'e0527a0561c2dae5b7b5c1b478d8c6bf',
    'shrub_02_1k.gltf': '8f7254d279c0c49c0b3edfe260aa5c86',
    'shrub_02.bin': '683b5475238310899eac1458520903e6',
    'shrub_02_diff_1k.jpg': '3f4ae281928de030c7d4e41ad5b88a8b',
    'shrub_02_alpha_1k.jpg': '6aa8ebb18cfc08fa6eab49bcf55ea22a',
}
AA = Image.Resampling.LANCZOS


def cutout(source, slug, resolution, box, outline=None):
    image = Image.open(source / f'{slug}_diff_{resolution}.jpg').convert('RGB')
    alpha = Image.open(source / f'{slug}_alpha_{resolution}.jpg').convert('L')
    if outline:
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).polygon(outline, fill=255)
        alpha = Image.fromarray(np.minimum(np.asarray(mask), np.asarray(alpha)))
    image.putalpha(alpha.point(lambda a: 0 if a < 8 else a))
    return image.crop(box)


def stamp(canvas, sprig, root, size, angle=0, light=1, mirror=False):
    """Place a bottom-anchored shoot; rotation takes place around its root."""
    piece = sprig.resize(tuple(max(1, round(s)) for s in size), AA)
    if mirror:
        piece = ImageOps.mirror(piece)
    if light != 1:
        alpha = piece.getchannel('A')
        piece = ImageEnhance.Brightness(piece.convert('RGB')).enhance(light).convert('RGBA')
        piece.putalpha(alpha)
    radius = math.ceil(math.hypot(piece.width, piece.height))
    carrier = Image.new('RGBA', (2*radius, 2*radius))
    carrier.paste(piece, (radius-piece.width//2, radius-piece.height))
    carrier = carrier.rotate(angle, Image.Resampling.BICUBIC)
    canvas.alpha_composite(carrier, (round(root[0]-radius), round(root[1]-radius)))


def branch_map(source):
    # Isolate the upper-left live shoot. Remaining white outside the author's UV islands
    # is dilation data, so a hand-traced polygon is necessary in addition to the alpha.
    shoot = cutout(source, 'pine_tree_01_twig', '2k', (59,65,464,914),
                   [(53,77),(392,64),(463,177),(457,517),(320,703),(306,908),
                    (249,911),(236,686),(63,496)])
    rng = random.Random(5072)
    image = Image.new('RGBA',(512,512))
    draw = ImageDraw.Draw(image)
    draw.line([(252,504),(257,348),(247,232),(258,85)],fill=(91,76,50),width=5)
    for idx in range(11):
        t = idx/11
        shaft = (253+5*math.sin(t*6), 465-t*342)
        width = 107 + 35*math.sin(t*math.pi) - 44*t
        length = 190 + 36*math.sin(t*math.pi) - 102*t
        for side in [-1,1]:
            stamp(image, shoot, shaft, (width,length*rng.uniform(.9,1.1)),
                  side*rng.uniform(38,62), rng.uniform(.80,1.2), side<0)
    stamp(image,shoot,(257,161),(78,149))
    return image


def rasterize(coords, faces, uvs, albedo, brightness, direction, size, span):
    """Two-sided orthographic triangle scan conversion, with affine UVs and a depth buffer."""
    right = np.cross([0., 1., 0.], direction)
    right = right/np.linalg.norm(right) if np.linalg.norm(right)>1e-8 else np.array([1., 0., 0.])
    up = np.cross(direction, right)
    w, h = size
    raster = np.stack((w*(.5+coords@right/span[0]), h*(.5-coords@up/span[1]), coords@direction), axis=1)
    buffer = np.zeros((h, w, 4), dtype='uint8')
    depth = np.full((h, w), -np.inf)
    for tri in faces:
        a, b, c = raster[tri]
        x0, y0 = np.maximum(np.floor(np.min([a,b,c], axis=0)[:2]).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(np.max([a,b,c], axis=0)[:2]).astype(int)+1, [w,h])
        if x1<=x0 or y1<=y0:
            continue
        denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denom)<1e-7:
            continue
        py, px = np.mgrid[y0:y1,x0:x1]+.5
        wa = ((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/denom
        wb = ((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/denom
        wc = 1-wa-wb
        dist = wa*a[2]+wb*b[2]+wc*c[2]
        patch = depth[y0:y1,x0:x1]
        st = wa[...,None]*uvs[tri[0]]+wb[...,None]*uvs[tri[1]]+wc[...,None]*uvs[tri[2]]
        sx = np.clip((st[:,:,0]*albedo.shape[1]).astype(int), 0, albedo.shape[1]-1)
        sy = np.clip((st[:,:,1]*albedo.shape[0]).astype(int), 0, albedo.shape[0]-1)
        color = albedo[sy, sx].copy()
        visible = (wa>=0)&(wb>=0)&(wc>=0)&(dist>patch)&(color[:,:,3]>=64)
        intensity = wa*brightness[tri[0]]+wb*brightness[tri[1]]+wc*brightness[tri[2]]
        color[:,:,:3] = np.clip(color[:,:,:3]*intensity[...,None], 0, 255)
        buffer[y0:y1,x0:x1][visible] = color[visible]
        patch[visible] = dist[visible]
    return Image.fromarray(buffer)


def ground_map(source, slug, shoots, size):
    """Bake cutouts from the selected original LOD0 meshes with their authored UVs."""
    gltf = json.loads((source/f'{slug}_1k.gltf').read_text())
    data = (source/f'{slug}.bin').read_bytes()

    def attribute(index):
        acc = gltf['accessors'][index]
        view = gltf['bufferViews'][acc['bufferView']]
        dtype = {5123:'<u2', 5125:'<u4', 5126:'<f4'}[acc['componentType']]
        n = {'SCALAR':1, 'VEC2':2, 'VEC3':3}[acc['type']]
        return np.frombuffer(data, dtype, count=n*acc['count'],
                             offset=view['byteOffset']+acc.get('byteOffset',0)).reshape(-1,n)
    positions, uvs, faces, brightness = [], [], [], []
    offset = 0
    for suffix, dx, angle, scale in shoots:
        node = next(n for n in gltf['nodes'] if n['name']==slug+'_'+suffix)
        prim = gltf['meshes'][node['mesh']]['primitives'][0]
        coord = attribute(prim['attributes']['POSITION']).copy()*scale
        rot = np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]])
        coord[:,[0,2]] = coord[:,[0,2]] @ rot
        coord[:,0] += dx
        normals = attribute(prim['attributes']['NORMAL']).copy()
        normals[:,[0,2]] = normals[:,[0,2]] @ rot
        y = np.clip(coord[:,1]/max(.01,coord[:,1].max()),0,1)
        brightness.extend(.63+.26*y+.20*np.abs(normals @ np.array([-.35,.84,.42])))
        positions.extend(coord)
        faces.extend(attribute(prim['indices']).reshape(-1,3).astype(int)+offset)
        uvs.extend(attribute(prim['attributes']['TEXCOORD_0']))
        offset += len(coord)
    positions = np.array(positions)
    direction = np.array([0,.08,1.])
    direction /= np.linalg.norm(direction)
    # Align the stem base to the card's lower edge. Preserve the original aspect.
    span_x = np.ptp(positions[:,0])*1.025
    span_y = np.ptp(positions[:,1])*1.03
    height = max(span_y, span_x*size[1]/size[0])
    center = [(positions[:,0].max()+positions[:,0].min())/2,
              positions[:,1].min()+height*.495, 0]
    coords = positions-center
    image = Image.open(source / f'{slug}_diff_1k.jpg').convert('RGB')
    image.putalpha(Image.open(source / f'{slug}_alpha_1k.jpg').convert('L'))
    return rasterize(coords, np.array(faces), np.array(uvs), np.asarray(image), np.array(brightness),
                     direction, (size[0]*2,size[1]*2), (height*size[0]/size[1],height))


def render_crown(crown, bough, cell=192):
    """Rasterize the same indexed branch triangles from 25 hemi-octahedral views."""
    positions = np.array(crown['positions']).reshape(-1,3)*[.56,1,.56]
    uv = np.array(crown['uvs']).reshape(-1,2)
    uv[:,1] = 1-uv[:,1]  # Three UVs are bottom-up, Pillow reads top-down.
    faces = np.array(crown['indices']).reshape(-1,3)
    rows = [(-.515,.56*.084*.56),(.465,.56*.084*.12)]
    stem = np.array([[r*math.cos(i*math.tau/7),y,r*math.sin(i*math.tau/7)]
                     for y,r in rows for i in range(7)])
    bark_faces = []
    for row in range(len(rows)-1):
        for i in range(7):
            a = row*7+i
            b = row*7+(i+1)%7
            bark_faces.extend([(a,b,a+7),(b,b+7,a+7)])
    bark_faces = np.array(bark_faces)+len(positions)
    coords = np.vstack((positions, stem))
    triangles = np.vstack((faces, bark_faces))
    albedo = np.array(bough)
    albedo[0,0] = [84,75,60,255]
    uv = np.vstack((uv, np.zeros((len(stem),2))))
    # Bake whorl self-occlusion, keeping ambient light, sun position and weather dynamic.
    brightness = .84+.25*np.linalg.norm(coords[:,[0,2]],axis=1)
    result = Image.new('RGBA',(5*cell,5*cell))
    for iy in range(5):
        for ix in range(5):
            qx,qy = ix/2-1,iy/2-1
            x,z = (qx+qy)/2,(qx-qy)/2
            direction = np.array([x,max(0.,1-abs(x)-abs(z)),z])
            direction /= np.linalg.norm(direction)
            tile = rasterize(coords,triangles,uv,albedo,brightness,direction,(cell*2,cell*2),(1.10,1.10))
            result.paste(tile.resize((cell,cell), AA),(ix*cell,(4-iy)*cell))
    return result


def publish(image, name, size):
    image = image.resize(size,AA)
    # Extend colour through the transparent perimeter before generating mipmaps. Runtime
    # textures have straight alpha; otherwise box filtering introduces a black fringe.
    rgba = np.array(image)
    active = rgba[:,:,3]>15
    rgb = rgba[:,:,:3].copy()
    for _ in range(8):
        missing = ~active
        for dy,dx in [(0,-1),(0,1),(-1,0),(1,0)]:
            neighbor = np.roll(active,(dy,dx),(0,1)) & missing
            rgb[neighbor] = np.roll(rgb,(dy,dx),(0,1))[neighbor]
        active = np.asarray(Image.fromarray(active.astype('uint8')*255).filter(ImageFilter.MaxFilter(3)))>0
    rgba[:,:,:3] = rgb
    staging = OUTPUT / ('.'+name+'.tmp')
    Image.fromarray(rgba).save(staging, format='WEBP', quality=88, method=6, exact=True)
    staging.replace(OUTPUT / (name+'.webp'))


def main(source):
    source = source.resolve()
    for name,expected in SOURCES.items():
        if hashlib.md5((source/name).read_bytes()).hexdigest()!=expected:
            raise ValueError(f'Poly Haven source digest mismatch: {name}')
    OUTPUT.mkdir(exist_ok=True,parents=True)
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        (work/'boulder.rgb').write_bytes(Image.open(source/'boulder_01_diff_1k.jpg').convert('RGB').tobytes())
        subprocess.run([str(ROOT/'node_modules/.bin/vite-node'),str(ROOT/'scripts/bake-vegetation-geometry.mjs'),
                        str(source),str(work),str(OUTPUT)],cwd=ROOT,check=True)
        bough = branch_map(source)
        grass = ground_map(source, 'grass_medium_01', [('mid_b_LOD0',0,.43,1)], (256,192))
        shrub = ground_map(source, 'shrub_02', [('a',-.13,.82,.58),('b',.05,.4,.92),
                                               ('d',.12,-.7,.75)], (256,208))
        publish(bough,'fir-bough',(384,384))
        publish(grass,'alpine-grass',(256,192))
        publish(shrub,'alpine-shrub',(256,208))
        atlas = render_crown(json.loads((work/'crown.json').read_text()),bough)
        publish(atlas,'fir-octa',atlas.size)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    main(parser.parse_args().source)
