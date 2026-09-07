# Bundled image decoder

`heic-to` 1.5.2 (LGPL-3.0) is bundled into `ui.html` for local HEIC/HEIF → PNG conversion.
It uses libheif 1.22.2. Upstream source, decoder build instructions and notices:

- https://github.com/hoppergee/heic-to
- https://github.com/strukturag/libheif

The package is unmodified. The `heic-to/csp` entry avoids eval and external resources.
The package lock records its exact npm distribution. To replace/rebuild it, install the
desired compatible version in this directory and run `npm run build`; the UI source and
build script are provided in this repository.

License texts are in `licenses/heic-to-LGPL-3.0.txt` and `licenses/GPL-3.0.txt`.
