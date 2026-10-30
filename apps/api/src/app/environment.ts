import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/u });
const tileUrl = z.union([
  z.literal(''),
  httpUrl,
  z
    .string()
    .startsWith('/')
    .refine((value) => !value.startsWith('//')),
]);
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.union([z.literal(''), z.url({ protocol: /^postgres(ql)?$/u })]).default(''),
  SESSION_SECRET: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  PUBLIC_ORIGIN: httpUrl.default('http://127.0.0.1:4200'),
  AUTH_EMAIL_ALLOWLIST: z.string().default(''),
  API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ROOT: z.string().default(''),
  ASSET_DIRECTORY: z.string().trim().min(1).default('./data/assets'),
  IMAGE_PROCESSING_TIMEOUT_MS: z.coerce.number().int().min(1).max(600_000).default(60_000),
  REDIS_URL: z.url({ protocol: /^rediss?$/u }).default('redis://127.0.0.1:6379'),
  MAPBOX_PUBLIC_TOKEN: z.string().trim().default(''),
  OSM_TILE_URL: tileUrl.default(''),
  OSM_ATTRIBUTION: z.string().default(''),
  SATELLITE_TILE_URL: tileUrl.default(''),
  SATELLITE_ATTRIBUTION: z.string().default(''),
  ADDRESS_SEARCH_URL: httpUrl.default('https://nominatim.openstreetmap.org/search'),
  ADDRESS_SEARCH_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .regex(/^[\x20-\x7e]+$/u)
    .default('PawTrace/1.0 (+https://github.com/Rizzlie/PawTrace)'),
  ADDRESS_SEARCH_ATTRIBUTION: z.string().trim().min(1).default('© OpenStreetMap contributors'),
  ADDRESS_SEARCH_ATTRIBUTION_URL: httpUrl.default('https://www.openstreetmap.org/copyright'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    // Never include raw values (Redis URLs can contain credentials) in startup errors.
    throw new Error(
      `Invalid API configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const env = parsed.data;
  if (
    (env.DATABASE_URL || env.NODE_ENV === 'production') &&
    (!env.DATABASE_URL ||
      env.SESSION_SECRET.length < 32 ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET)
  ) {
    throw new Error(
      'Authentication requires DATABASE_URL, SESSION_SECRET (32+ characters), GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
    );
  }
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (
    origin.origin !== env.PUBLIC_ORIGIN ||
    origin.username ||
    origin.password ||
    (env.NODE_ENV === 'production' && origin.protocol !== 'https:') ||
    (origin.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  ) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin (loopback HTTP allowed in development)');
  }
  return parsed.data;
}
