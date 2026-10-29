import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApplication as createConfiguredApplication } from '../tests/adapter-application';

const createApplication = () => createConfiguredApplication({ ignoreEnvFile: true });

describe('HTTP health endpoint', () => {
  let app: NestExpressApplication;
  beforeEach(() => {
    for (const setting of [
      'OSM_TILE_URL',
      'OSM_ATTRIBUTION',
      'SATELLITE_TILE_URL',
      'SATELLITE_ATTRIBUTION',
    ])
      vi.stubEnv(setting, '');
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each(['', 'pk.test-browser-token', 'sk.never-expose'])(
    'serves only public map credentials (%s)',
    async (token) => {
      vi.stubEnv('MAPBOX_PUBLIC_TOKEN', token);
      app = await createApplication();
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/api/map-config`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        mapboxToken: token.startsWith('pk.') ? token : '',
      });
    },
  );

  it('responds successfully over HTTP without infrastructure dependencies', async () => {
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('exposes both source templates and their attribution from the runtime environment', async () => {
    vi.stubEnv('MAPBOX_PUBLIC_TOKEN', '');
    vi.stubEnv('OSM_TILE_URL', 'https://maps.example.test/street/{z}/{x}/{y}.png');
    vi.stubEnv('OSM_ATTRIBUTION', '<a href="https://maps.example.test/">Street provider</a>');
    vi.stubEnv(
      'SATELLITE_TILE_URL',
      'https://maps.example.test/satellite/{z}/{x}/{y}?token={accessToken}',
    );
    vi.stubEnv('SATELLITE_ATTRIBUTION', 'Satellite provider');
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/map-config`);
    expect(await response.json()).toEqual({
      mapboxToken: '',
      osm: {
        urlTemplate: 'https://maps.example.test/street/{z}/{x}/{y}.png',
        attribution: '<a href="https://maps.example.test/">Street provider</a>',
      },
      satellite: {
        urlTemplate: 'https://maps.example.test/satellite/{z}/{x}/{y}?token={accessToken}',
        attribution: 'Satellite provider',
      },
    });
  });
});
