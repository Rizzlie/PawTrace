import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApplication } from '../tests/adapter-application';

describe('validated API configuration at startup', () => {
  let app: NestExpressApplication | undefined;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pawtrace-config-'));
    app = undefined;
    vi.stubEnv('MAPBOX_PUBLIC_TOKEN', undefined);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it('loads .env through Nest ConfigModule and gives shell settings precedence', async () => {
    const envFilePath = join(directory, '.env');
    await writeFile(envFilePath, 'MAPBOX_PUBLIC_TOKEN=pk.from-env-file\n');
    app = await createApplication({ envFilePath });
    await app.listen(0, '127.0.0.1');
    expect(await (await fetch(`${await app.getUrl()}/api/map-config`)).json()).toEqual({
      mapboxToken: 'pk.from-env-file',
    });
    await app.close();
    vi.stubEnv('MAPBOX_PUBLIC_TOKEN', 'pk.from-shell');
    app = await createApplication({ envFilePath });
    await app.listen(0, '127.0.0.1');
    expect(await (await fetch(`${await app.getUrl()}/api/map-config`)).json()).toEqual({
      mapboxToken: 'pk.from-shell',
    });
  });

  it.each([
    ['API_PORT', 'not-a-port'],
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['REDIS_URL', 'https://user:example-secret@cache.invalid'],
    ['ADDRESS_SEARCH_URL', 'file:///private'],
    ['ADDRESS_SEARCH_USER_AGENT', 'PawTrace\r\nInjected: value'],
  ])('rejects invalid %s before boot and reports only its name', async (field, value) => {
    vi.stubEnv(field, value);
    await expect(createApplication({ ignoreEnvFile: true })).rejects.toThrow(
      `Invalid API configuration: ${field}`,
    );
    try {
      await createApplication({ ignoreEnvFile: true });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) expect(error.message).not.toContain(value);
    }
  });
});
