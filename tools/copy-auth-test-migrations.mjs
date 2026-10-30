import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/auth-test/src/auth/migrations', { recursive: true });
await cp('apps/api/src/auth/migrations', 'dist/auth-test/src/auth/migrations', { recursive: true });
