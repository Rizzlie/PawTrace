import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/auth/schema.ts', './src/cases/schema.ts'],
  out: './src/database/migrations',
});
