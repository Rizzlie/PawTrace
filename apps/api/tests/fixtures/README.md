# Original-photo fixtures

`photo.jpg`, `photo.webp`, and `photo.heic` are unchanged copies of `fixture.jpg`, `fixture.webp`, and `fixture-mif1.heic` from [file-type](https://github.com/sindresorhus/file-type/tree/08bef8e7c733728d5c30390ea177ca1a262452d1/fixture). Its MIT license is preserved in `LICENSE.file-type`.

F11 tests compare received/downloaded original bytes. These fixtures do not establish decoder or preview acceptance, which belongs to F12. The inline PNG and deliberately incomplete HEIC signature in `src/assets.spec.ts` additionally exercise small uploads and independent original storage.

## HEIC processing fixtures

`heic/` contains unchanged CC0 charts from [heic.fyi's sample set](https://heic.fyi/heic-sample-files), generated 2026-10-11. Its [licence](heic/LICENSE.txt) and the selected entries of the upstream [manifest](heic/manifest.json) are preserved. `api:verify-images` verifies every SHA-256 against that manifest before uploading.

Coverage: 8-bit HEVC, 10-bit Display P3 and PQ HDR input, 12/48-megapixel grids, embedded thumbnail, four images with the third marked primary, alpha, and all eight orientations. These are synthetic codec/conformance charts, supplemented by the existing real `photo.heic`; they do not represent every phone's HDR/gain-map or camera profile. Expected dimensions come from the independently published manifest, not from the implementation under test.
