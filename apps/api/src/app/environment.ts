import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/u });
const tileUrl = z.union([
  z.literal(""),
  httpUrl,
  z
    .string()
    .startsWith("/")
    .refine((value) => !value.startsWith("//")),
]);
const environmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ROOT: z.string().default(""),
  REDIS_URL: z
    .url({ protocol: /^rediss?$/u })
    .default("redis://127.0.0.1:6379"),
  MAPBOX_PUBLIC_TOKEN: z.string().trim().default(""),
  OSM_TILE_URL: tileUrl.default(""),
  OSM_ATTRIBUTION: z.string().default(""),
  SATELLITE_TILE_URL: tileUrl.default(""),
  SATELLITE_ATTRIBUTION: z.string().default(""),
  ADDRESS_SEARCH_URL: httpUrl.default(
    "https://nominatim.openstreetmap.org/search",
  ),
  ADDRESS_SEARCH_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .regex(/^[\x20-\x7e]+$/u)
    .default("PawTrace/1.0 (+https://github.com/Rizzlie/PawTrace)"),
  ADDRESS_SEARCH_ATTRIBUTION: z
    .string()
    .trim()
    .min(1)
    .default("© OpenStreetMap contributors"),
  ADDRESS_SEARCH_ATTRIBUTION_URL: httpUrl.default(
    "https://www.openstreetmap.org/copyright",
  ),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    // Never include raw values (Redis URLs can contain credentials) in startup errors.
    throw new Error(
      `Invalid API configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  }
  return parsed.data;
}
