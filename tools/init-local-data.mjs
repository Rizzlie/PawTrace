import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const postgresPassword = randomBytes(32).toString('hex');
const redisPassword = randomBytes(32).toString('hex');
const destination = new URL('../.env.local-data', import.meta.url);

try {
  await writeFile(
    destination,
    [
      '# Private local credentials. Keep this file for the lifetime of the data volumes.',
      'POSTGRES_PORT=5432',
      'REDIS_PORT=6380',
      `POSTGRES_PASSWORD=${postgresPassword}`,
      `REDIS_PASSWORD=${redisPassword}`,
      '# npm run dev:apps loads these connection settings automatically.',
      `DATABASE_URL=postgres://pawtrace:${postgresPassword}@127.0.0.1:5432/pawtrace`,
      `REDIS_URL=redis://:${redisPassword}@127.0.0.1:6380`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created .env.local-data with independent random passwords. Existing .env unchanged.',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.local-data already exists; kept existing credentials.');
}
