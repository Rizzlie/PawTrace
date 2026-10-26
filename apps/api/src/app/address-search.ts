import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Header,
  Injectable,
  Inject,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "./environment";

interface AddressResult {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}
interface SearchResponse {
  results: AddressResult[];
  attribution: { label: string; url: string };
}

@Injectable()
export class AddressSearch {
  private readonly pending = new Map<string, Promise<SearchResponse>>();
  private tail: Promise<unknown> = Promise.resolve();
  private nextAllowed = 0;
  private readonly upstream: string;
  private readonly userAgent: string;
  private readonly attribution: SearchResponse["attribution"];

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    settings: ConfigService<Environment, true>,
  ) {
    this.upstream = settings.get("ADDRESS_SEARCH_URL", { infer: true });
    this.userAgent = settings.get("ADDRESS_SEARCH_USER_AGENT", { infer: true });
    this.attribution = {
      label: settings.get("ADDRESS_SEARCH_ATTRIBUTION", { infer: true }),
      url: settings.get("ADDRESS_SEARCH_ATTRIBUTION_URL", { infer: true }),
    };
    // cache-manager reports read failures via this event and otherwise treats them as misses.
    // Fail closed instead of repeatedly querying the public provider without a working cache.
    this.cache.on("get", (event) => {
      if (event.error)
        throw new ServiceUnavailableException(
          "Cache wyszukiwania jest niedostępny. Przesuń mapę ręcznie lub spróbuj później.",
        );
    });
  }

  async search(query: unknown): Promise<SearchResponse> {
    if (
      typeof query !== "string" ||
      query.trim().length < 2 ||
      query.length > 200 ||
      Array.from(query).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new BadRequestException("Podaj adres od 2 do 200 znaków.");
    }
    const normalized = query.trim().normalize("NFC").replace(/\s+/gu, " ");
    const key = `address-search:v1:${createHash("sha256")
      .update(
        JSON.stringify([
          this.upstream,
          this.userAgent,
          this.attribution,
          normalized.toLocaleLowerCase("pl"),
        ]),
      )
      .digest("hex")}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 50)
      throw new ServiceUnavailableException(
        "Kolejka wyszukiwania jest pełna. Spróbuj później.",
      );
    // Reserve the query before the asynchronous Redis read, so late cache misses
    // cannot enqueue a duplicate just after another request has filled the cache.
    const result = this.cachedSearch(key, normalized).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, result);
    return result;
  }

  private async cachedSearch(
    key: string,
    query: string,
  ): Promise<SearchResponse> {
    const cached = await this.cache.get<SearchResponse>(key);
    if (cached) return cached;
    const job = this.tail.then(async () => {
      // A full second after completion is conservative, including slow responses.
      while (performance.now() < this.nextAllowed)
        await delay(
          Math.min(30000, Math.ceil(this.nextAllowed - performance.now())),
        );
      try {
        const value = await this.request(query);
        try {
          await this.cache.set(key, value);
        } catch {
          throw new ServiceUnavailableException(
            "Nie udało się zapisać wyniku w cache wyszukiwania. Spróbuj później.",
          );
        }
        return value;
      } finally {
        this.nextAllowed = Math.max(this.nextAllowed, performance.now() + 1000);
      }
    });
    this.tail = job.catch(() => undefined);
    return job;
  }

  private async request(query: string): Promise<SearchResponse> {
    try {
      const url = new URL(this.upstream);
      url.search = new URLSearchParams({
        q: query,
        countrycodes: "pl",
        format: "jsonv2",
        addressdetails: "1",
        limit: "5",
        "accept-language": "pl",
      }).toString();
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (response.status === 429 || response.status === 503) {
        const header = response.headers.get("retry-after") ?? "";
        const milliseconds = /^\d+$/u.test(header)
          ? Number(header) * 1000
          : Date.parse(header) - Date.now();
        this.nextAllowed =
          performance.now() +
          (Number.isFinite(milliseconds) && milliseconds > 0
            ? milliseconds
            : 60000);
        await response.body?.cancel();
        throw new ServiceUnavailableException(
          "Dostawca wyszukiwania jest chwilowo niedostępny. Spróbuj później lub przesuń mapę ręcznie.",
        );
      }
      if (!response.ok) throw new Error("Search provider unavailable");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid search response");
      const results: AddressResult[] = data
        .map((item): AddressResult | undefined => {
          if (
            !item ||
            typeof item !== "object" ||
            !item.address ||
            typeof item.address !== "object" ||
            typeof item.address.country_code !== "string"
          )
            throw new Error("Invalid search result");
          if (item.address.country_code.toLowerCase() !== "pl")
            return undefined;
          const latitude = Number(item.lat);
          const longitude = Number(item.lon);
          if (
            typeof item.lat !== "string" ||
            !item.lat.trim() ||
            typeof item.lon !== "string" ||
            !item.lon.trim() ||
            !Number.isFinite(latitude) ||
            Math.abs(latitude) > 90 ||
            !Number.isFinite(longitude) ||
            Math.abs(longitude) > 180 ||
            typeof item.display_name !== "string" ||
            !item.display_name.trim() ||
            !["node", "way", "relation"].includes(item.osm_type) ||
            !Number.isSafeInteger(item.osm_id)
          )
            throw new Error("Invalid search result");
          return {
            id: `${item.osm_type}:${item.osm_id}`,
            label: item.display_name,
            latitude,
            longitude,
          };
        })
        .filter((item): item is AddressResult => item !== undefined)
        .slice(0, 5);
      return { results, attribution: this.attribution };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadGatewayException(
        "Wyszukiwarka adresów jest niedostępna. Możesz nadal przesuwać mapę ręcznie.",
      );
    }
  }
}

@Controller("address-search")
export class AddressSearchController {
  constructor(private readonly addresses: AddressSearch) {}

  @Get()
  @Header("Cache-Control", "no-store")
  search(@Query("q") query: unknown) {
    return this.addresses.search(query);
  }
}
