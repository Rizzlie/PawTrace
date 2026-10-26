import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, timeout } from "rxjs";

/** A selection proposes coordinates; the consumer decides whether to move or draft a point. */
export interface AddressSearchResult {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}
export interface AddressSearchResponse {
  results: AddressSearchResult[];
  attribution: { label: string; url: string };
}

function isResult(value: unknown): value is AddressSearchResult {
  if (!value || typeof value !== "object") return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    "latitude" in value &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    "longitude" in value &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

@Injectable({ providedIn: "root" })
export class AddressSearchClient {
  private readonly http = inject(HttpClient);

  search(query: string) {
    return this.http
      .get<unknown>("/api/address-search", { params: { q: query } })
      .pipe(
        timeout(30000),
        map((value): AddressSearchResponse => {
          if (
            !value ||
            typeof value !== "object" ||
            !("results" in value) ||
            !Array.isArray(value.results) ||
            !value.results.every(isResult) ||
            !("attribution" in value) ||
            !value.attribution ||
            typeof value.attribution !== "object" ||
            !("label" in value.attribution) ||
            typeof value.attribution.label !== "string" ||
            !("url" in value.attribution) ||
            typeof value.attribution.url !== "string" ||
            !/^https?:\/\//u.test(value.attribution.url)
          )
            throw new Error("Invalid address search response");
          return {
            results: value.results,
            attribution: {
              label: value.attribution.label,
              url: value.attribution.url,
            },
          };
        }),
      );
  }
}
