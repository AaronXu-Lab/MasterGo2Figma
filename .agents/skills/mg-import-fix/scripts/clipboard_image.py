#!/usr/bin/env python3
"""One-shot macOS PNG clipboard I/O; see references/images.md for UI checks."""

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image


def validate_png(data):
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'PNG':
            raise ValueError('Only PNG accepted')
        size = image.size
        image.verify()
    return size


def read_png(pb, png_type, tiff_type):
    data = pb.dataForType_(png_type)
    if data is not None:
        return bytes(data), 'PNG'
    data = pb.dataForType_(tiff_type)
    if data is None:
        raise ValueError('Clipboard has no PNG/TIFF image')
    with Image.open(io.BytesIO(bytes(data))) as image:
        if image.format != 'TIFF':
            raise ValueError('Clipboard TIFF payload is not TIFF')
        output = io.BytesIO()
        image.convert('RGBA').save(output, format='PNG')
    return output.getvalue(), 'TIFF'


def operate(action, path, pb, png_type, tiff_type, make_data,
            after_count=None, expected_count=None):
    count = int(pb.changeCount())
    if action == 'status':
        return {'changeCount': count, 'types': list(pb.types() or [])}
    path = Path(path).expanduser().absolute()
    if action == 'save':
        if after_count is not None and count <= after_count:
            raise RuntimeError('Clipboard did not advance after copy')
        if expected_count is not None and count != expected_count:
            raise RuntimeError('Clipboard changed since UI verification')
        data, source_type = read_png(pb, png_type, tiff_type)
        width, height = validate_png(data)
        if int(pb.changeCount()) != count:
            raise RuntimeError('Clipboard changed during read; nothing saved')
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as output:
            output.write(data)
    elif action == 'load':
        data = path.read_bytes()
        width, height = validate_png(data)
        source_type = 'PNG'
        pb.clearContents()
        if not pb.setData_forType_(make_data(data), png_type):
            raise RuntimeError('Pasteboard write failed')
        count = int(pb.changeCount())
        readback = pb.dataForType_(png_type)
        if readback is None or bytes(readback) != data:
            raise RuntimeError('PNG readback differs')
        if int(pb.changeCount()) != count:
            raise RuntimeError('Clipboard changed during readback')
    else:
        raise ValueError('Unknown action')
    return {'path': str(path), 'width': width, 'height': height,
            'sha256': hashlib.sha256(data).hexdigest(),
            'changeCount': count, 'sourceType': source_type}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'save', 'load'])
    parser.add_argument('path', nargs='?')
    parser.add_argument('--after-count', type=int, help='save: require newer clipboard')
    parser.add_argument('--expected-count', type=int, help='save: require verified count')
    args = parser.parse_args()
    if (args.action == 'status') != (args.path is None):
        parser.error('status takes no path; save/load require a path')
    if args.action != 'save' and (args.after_count is not None or args.expected_count is not None):
        parser.error('count guards are only valid for save')
    try:
        from AppKit import NSPasteboard, NSPasteboardTypePNG, NSPasteboardTypeTIFF
        from Foundation import NSData
        result = operate(args.action, args.path, NSPasteboard.generalPasteboard(),
                         NSPasteboardTypePNG, NSPasteboardTypeTIFF,
                         lambda data: NSData.dataWithBytes_length_(data, len(data)),
                         args.after_count, args.expected_count)
    except (ImportError, OSError, ValueError, RuntimeError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
