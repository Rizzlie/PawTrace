import { cp, mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/auth-test/apps/api/src/database/migrations', { recursive: true });
await cp('apps/api/src/database/migrations', 'dist/auth-test/apps/api/src/database/migrations', {
  recursive: true,
});
// Plain tsc keeps workspace path aliases; resolve the shared contract like the webpack build does.
await mkdir('dist/auth-test/node_modules/@pawtrace/case-domain', { recursive: true });
await writeFile(
  'dist/auth-test/node_modules/@pawtrace/case-domain/package.json',
  JSON.stringify({
    name: '@pawtrace/case-domain',
    main: '../../../libs/shared/case-domain/src/index.js',
  }),
);
