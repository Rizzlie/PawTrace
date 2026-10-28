# Original-photo fixtures

`photo.jpg`, `photo.webp`, and `photo.heic` are unchanged copies of `fixture.jpg`, `fixture.webp`, and `fixture-mif1.heic` from [file-type](https://github.com/sindresorhus/file-type/tree/08bef8e7c733728d5c30390ea177ca1a262452d1/fixture). Its MIT license is preserved in `LICENSE.file-type`.

F11 tests compare received/downloaded original bytes. These fixtures do not establish decoder or preview acceptance, which belongs to F12. The inline PNG and deliberately incomplete HEIC signature in `src/assets.spec.ts` additionally exercise small uploads and independent original storage.
