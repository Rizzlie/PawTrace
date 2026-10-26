import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Header,
  Injectable,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import { setTimeout as delay } from "node:timers/promises";

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
  private readonly cache = new Map<
    string,
    { value: SearchResponse; expires: number }
  >();
  private readonly pending = new Map<string, Promise<SearchResponse>>();
  private tail: Promise<unknown> = Promise.resolve();
  private nextAllowed = 0;
  private readonly upstream =
    process.env["ADDRESS_SEARCH_URL"] ||
    "https://nominatim.openstreetmap.org/search";
  private readonly userAgent =
    process.env["ADDRESS_SEARCH_USER_AGENT"] ||
    "PawTrace/1.0 (+https://github.com/Rizzlie/PawTrace)";
  private readonly attribution = {
    label:
      process.env["ADDRESS_SEARCH_ATTRIBUTION"] ||
      "© OpenStreetMap contributors",
    url:
      process.env["ADDRESS_SEARCH_ATTRIBUTION_URL"] ||
      "https://www.openstreetmap.org/copyright",
  };

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
    const key = normalized.toLocaleLowerCase("pl");
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 50)
      throw new ServiceUnavailableException(
        "Kolejka wyszukiwania jest pełna. Spróbuj później.",
      );
    const job = this.tail.then(async () => {
      // A full second after completion is conservative, including slow responses.
      while (performance.now() < this.nextAllowed)
        await delay(Math.ceil(this.nextAllowed - performance.now()));
      try {
        const value = await this.request(normalized);
        this.cache.delete(key);
        const oldest = this.cache.keys().next().value;
        if (this.cache.size >= 500 && oldest !== undefined)
          this.cache.delete(oldest);
        this.cache.set(key, {
          value,
          expires: Date.now() + 24 * 60 * 60 * 1000,
        });
        return value;
      } finally {
        this.nextAllowed = Math.max(this.nextAllowed, performance.now() + 1000);
        this.pending.delete(key);
      }
    });
    this.pending.set(key, job);
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
