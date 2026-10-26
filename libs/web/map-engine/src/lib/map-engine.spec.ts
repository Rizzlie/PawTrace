import { TestBed } from "@angular/core/testing";
import { MapEngine } from "./map-engine";
import { LeafletMap } from "./leaflet-map";

describe("Map host and location on demand", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("provides separate map services and destroys only the removed host's map", async () => {
    const first = TestBed.createComponent(MapEngine);
    const second = TestBed.createComponent(MapEngine);
    await Promise.all([first.whenStable(), second.whenStable()]);
    const firstMap = first.debugElement.injector.get(LeafletMap);
    const secondMap = second.debugElement.injector.get(LeafletMap);
    expect(firstMap).not.toBe(secondMap);
    const firstHost: HTMLElement = first.nativeElement;
    const secondHost: HTMLElement = second.nativeElement;
    expect(firstHost.querySelector(".leaflet-map-pane")).not.toBeNull();
    expect(secondHost.querySelector(".leaflet-map-pane")).not.toBeNull();
    first.destroy();
    expect(firstHost.querySelector(".leaflet-map-pane")).toBeNull();
    expect(secondHost.querySelector(".leaflet-map-pane")).not.toBeNull();
    second.destroy();
    expect(secondHost.querySelector(".leaflet-map-pane")).toBeNull();
  });

  it("renders service signals directly and reacts to changing inputs", async () => {
    const fixture = TestBed.createComponent(MapEngine);
    fixture.componentRef.setInput("config", { mapboxToken: "pk.test" });
    await fixture.whenStable();
    const map = fixture.debugElement.injector.get(LeafletMap);
    map.selectBasemap("satellite");
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toContain("Satelita");
    expect(host.querySelector(".mapbox-logo")).not.toBeNull();
    fixture.componentRef.setInput("config", { mapboxToken: "" });
    await fixture.whenStable();
    expect(
      host.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toContain("Mapa OSM");
    expect(host.querySelector(".mapbox-logo")).toBeNull();
  });

  it("explains unavailable geolocation", async () => {
    vi.stubGlobal("navigator", {});
    const fixture = TestBed.createComponent(MapEngine);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>(".map-tools > button")?.click();
    await fixture.whenStable();
    expect(host.textContent).toContain("Lokalizacja jest niedostępna");
  });

  it("requests once on click, handles denial and ignores callbacks after destruction", async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const fixture = TestBed.createComponent(MapEngine);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector<HTMLButtonElement>(".map-tools > button");
    if (!button) throw new Error("Location button missing");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    button.click();
    button.click();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const failure = getCurrentPosition.mock.calls[0][1];
    failure({ code: 1 });
    await fixture.whenStable();
    expect(host.textContent).toContain("Brak zgody na lokalizację");
    expect(button.disabled).toBe(false);
    fixture.destroy();
    expect(() => failure({ code: 1 })).not.toThrow();
  });
});
