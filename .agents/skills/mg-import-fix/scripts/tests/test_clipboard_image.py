"""Offline tests: never read or mutate the system clipboard."""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location('clipboard_image', Path(__file__).parents[1] / 'clipboard_image.py')
clipboard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clipboard)


def image_bytes(fmt='PNG'):
    output = io.BytesIO()
    Image.new('RGBA', (3, 2), (12, 34, 56, 78)).save(output, format=fmt)
    return output.getvalue()


class Pasteboard:
    def __init__(self, payload=None):
        self.payload = payload or {}
        self.count = 5
        self.race = False
        self.corrupt = False
        self.reject = False

    def changeCount(self):
        return self.count

    def types(self):
        return list(self.payload)

    def dataForType_(self, kind):
        if self.race:
            self.count += 1
        return self.payload.get(kind)

    def clearContents(self):
        self.payload.clear()
        self.count += 1

    def setData_forType_(self, data, kind):
        self.payload[kind] = b'broken' if self.corrupt else data
        self.count += 1
        return not self.reject


class ClipboardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / '001.png'
        self.png = image_bytes()
        self.pb = Pasteboard({'PNG': self.png, 'TIFF': image_bytes('TIFF')})

    def run_action(self, action, **kwargs):
        return clipboard.operate(action, self.path, self.pb, 'PNG', 'TIFF', bytes, **kwargs)

    def test_status(self):
        self.assertEqual(self.run_action('status'), {'changeCount': 5, 'types': ['PNG', 'TIFF']})

    def test_png_priority_and_exclusive_create(self):
        result = self.run_action('save', after_count=4, expected_count=5)
        self.assertEqual(self.path.read_bytes(), self.png)
        self.assertEqual((result['width'], result['height'], result['sourceType']), (3, 2, 'PNG'))
        with self.assertRaises(FileExistsError):
            self.run_action('save')
        self.assertEqual(self.path.read_bytes(), self.png)

    def test_tiff_preserves_alpha(self):
        del self.pb.payload['PNG']
        self.assertEqual(self.run_action('save')['sourceType'], 'TIFF')
        with Image.open(self.path) as image:
            self.assertEqual(image.getpixel((0, 0)), (12, 34, 56, 78))

    def test_stale_or_changed_clipboard_does_not_save(self):
        for kwargs in ({'after_count': 5}, {'expected_count': 4}):
            with self.assertRaises(RuntimeError):
                self.run_action('save', **kwargs)
        self.pb.race = True
        with self.assertRaises(RuntimeError):
            self.run_action('save')
        self.assertFalse(self.path.exists())

    def test_missing_or_invalid_image_does_not_save(self):
        for payload in ({}, {'PNG': b'bad'}, {'PNG': image_bytes('TIFF')}):
            self.pb.payload = payload
            with self.assertRaises((ValueError, OSError)):
                self.run_action('save')
        self.assertFalse(self.path.exists())

    def test_load_roundtrip_unchanged_bytes(self):
        self.path.write_bytes(self.png)
        result = self.run_action('load')
        self.assertEqual(self.pb.payload, {'PNG': self.png})
        self.assertEqual((result['width'], result['height']), (3, 2))

    def test_invalid_load_does_not_clear_clipboard(self):
        self.path.write_bytes(image_bytes('TIFF'))
        with self.assertRaises(ValueError):
            self.run_action('load')
        self.assertEqual(self.pb.count, 5)
        self.assertEqual(self.pb.payload['PNG'], self.png)

    def test_write_failure_and_corrupt_readback(self):
        self.path.write_bytes(self.png)
        for flag in ('reject', 'corrupt', 'race'):
            self.pb = Pasteboard()
            setattr(self.pb, flag, True)
            with self.assertRaises(RuntimeError):
                self.run_action('load')


if __name__ == '__main__':
    unittest.main()
