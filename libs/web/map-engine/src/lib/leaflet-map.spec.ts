import { LeafletMap } from "./leaflet-map";
import { TestBed } from "@angular/core/testing";

const captured = vi.hoisted(() => ({
  layers: [] as import("leaflet").TileLayer[],
  maps: [] as import("leaflet").Map[],
}));
vi.mock("leaflet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("leaflet")>();
  return {
    ...actual,
    map: (...args: Parameters<typeof actual.map>) => {
      const map = actual.map(...args);
      captured.maps.push(map);
      return map;
    },
    tileLayer: (...args: Parameters<typeof actual.tileLayer>) => {
      const layer = actual.tileLayer(...args);
      captured.layers.push(layer);
      return layer;
    },
  };
});

describe("Leaflet lifecycle and basemaps", () => {
  let engine: LeafletMap;
  let container: HTMLDivElement;
  const viewportChanged = vi.fn();
  const basemapChanged = vi.fn();
  const tileMessage = vi.fn();
  const disconnect = vi.fn();
  let resize: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    captured.layers.length = 0;
    captured.maps.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {
          /* controlled container resize */
        }
        disconnect = disconnect;
      },
    );
    container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 1100 },
      clientHeight: { value: 700 },
    });
    document.body.append(container);
    TestBed.configureTestingModule({ providers: [LeafletMap] });
    engine = TestBed.inject(LeafletMap);
    engine.initialize(container, {
      viewportChanged,
      basemapChanged,
      tileMessage,
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts over Poland and preserves view through both basemap switches", async () => {
    expect(engine.getViewport().latitude).toBeGreaterThan(49);
    expect(engine.getViewport().latitude).toBeLessThan(55);
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    engine.restoreViewport(view);
    await vi.advanceTimersByTimeAsync(20);
    engine.configure({ mapboxToken: "pk.controlled-test" });
    engine.selectBasemap("satellite");
    const layer = captured.layers[captured.layers.length - 1];
    expect(layer.options.tileSize).toBe(512);
    expect(layer.options.zoomOffset).toBe(-1);
    expect(engine.getViewport()).toEqual(view);
    engine.selectBasemap("osm");
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Improve this map");
    captured.maps[0].setZoom(14, { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
  });

  it("emits completed user navigation but suppresses restore and resize", async () => {
    engine.restoreViewport({ latitude: 52, longitude: 20, zoom: 10 });
    await vi.advanceTimersByTimeAsync(20);
    resize();
    expect(viewportChanged).not.toHaveBeenCalled();
    captured.maps[0].panTo([53, 21], { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
    expect(viewportChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitude: 53, longitude: 21 }),
    );
  });

  it("restores the latest viewport after an in-flight animated zoom without emitting an edit", async () => {
    const map = captured.maps[0];
    // jsdom has no CSS transitions. Drive the pinned Leaflet animation path
    // itself, including its real completion timer and event ordering.
    map.fire("zoomstart");
    Reflect.apply(Reflect.get(map, "_animateZoom"), map, [
      map.getCenter(),
      8,
      true,
    ]);
    engine.restoreViewport({ latitude: 51, longitude: 19, zoom: 11 });
    const latestView = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    engine.restoreViewport(latestView);
    resize();
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getViewport()).toEqual(latestView);
    expect(viewportChanged).not.toHaveBeenCalled();
    map.panTo([53, 21], { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
  });

  it("restores after a zoom that was queued for the next animation frame", async () => {
    const map = captured.maps[0];
    requestAnimationFrame(() => {
      map.fire("zoomstart");
      Reflect.apply(Reflect.get(map, "_animateZoom"), map, [
        map.getCenter(),
        8,
        true,
      ]);
    });
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    engine.restoreViewport(view);
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
  });

  it("does not request satellite tiles without credentials", () => {
    engine.selectBasemap("satellite");
    expect(captured.layers).toHaveLength(1);
    expect(tileMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("tokenu Mapbox"),
    );
  });

  it("reconfigures source URLs and attribution in place while preserving the viewport", async () => {
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    engine.restoreViewport(view);
    await vi.advanceTimersByTimeAsync(20);
    const config = {
      mapboxToken: "pk.test&value",
      osm: {
        urlTemplate: "https://maps.example.test/street/{z}/{x}/{y}",
        attribution: "Street provider",
      },
      satellite: {
        urlTemplate:
          "https://maps.example.test/satellite/{z}/{x}/{y}?token={accessToken}",
        attribution: "Satellite provider",
      },
    };
    engine.configure(config);
    expect(
      container.querySelector<HTMLImageElement>("img.leaflet-tile")?.src,
    ).toContain("maps.example.test/street/");
    expect(container.textContent).toContain("Street provider");
    engine.selectBasemap("satellite");
    expect(
      container.querySelector<HTMLImageElement>("img.leaflet-tile")?.src,
    ).toContain("token=pk.test%26value");
    expect(container.textContent).toContain("Satellite provider");
    engine.configure({
      ...config,
      satellite: { ...config.satellite, attribution: "Updated provider" },
    });
    expect(container.textContent).toContain("Updated provider");
    expect(container.textContent).not.toContain("Satellite provider");
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
  });

  it("sanitizes configured attribution before Leaflet inserts it into the DOM", () => {
    engine.configure({
      mapboxToken: "",
      osm: {
        urlTemplate: "https://maps.example.test/{z}/{x}/{y}",
        attribution:
          '<a href="https://maps.example.test/" onclick="alert(1)">Provider</a><script>alert(1)</script>',
      },
    });
    const link = container.querySelector(
      'a[href="https://maps.example.test/"]',
    );
    expect(link?.textContent).toBe("Provider");
    expect(link?.hasAttribute("onclick")).toBe(false);
    expect(container.querySelector("script")).toBeNull();
  });

  it("cancels pending restoration when Angular destroys the map service", async () => {
    engine.restoreViewport({ latitude: 52, longitude: 21, zoom: 12 });
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(500);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.querySelector(".leaflet-map-pane")).toBeNull();
  });

  it("lets an active zoom finish safely when the host is destroyed during restoration", async () => {
    const map = captured.maps[0];
    map.fire("zoomstart");
    Reflect.apply(Reflect.get(map, "_animateZoom"), map, [
      map.getCenter(),
      8,
      true,
    ]);
    engine.restoreViewport({ latitude: 52, longitude: 21, zoom: 13 });
    await vi.advanceTimersByTimeAsync(20);
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(500);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.querySelector(".leaflet-map-pane")).toBeNull();
  });

  it("falls back once after a satellite error and ignores stale layer events", () => {
    engine.configure({ mapboxToken: "pk.controlled-test" });
    engine.selectBasemap("satellite");
    const satellite = captured.layers[captured.layers.length - 1];
    satellite.fire("tileerror");
    expect(basemapChanged).toHaveBeenLastCalledWith("osm");
    expect(tileMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("Przywrócono"),
    );
    const count = captured.layers.length;
    satellite.fire("tileerror");
    vi.advanceTimersByTime(16000);
    expect(captured.layers).toHaveLength(count);
  });

  it("falls back when satellite requests hang", () => {
    engine.configure({ mapboxToken: "pk.controlled-test" });
    engine.selectBasemap("satellite");
    vi.advanceTimersByTime(15000);
    expect(basemapChanged).toHaveBeenLastCalledWith("osm");
  });

  it("allows manual OSM recovery and destroys resources so the container can be reused", () => {
    captured.layers[0].fire("tileerror");
    expect(tileMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("Nie udało"),
    );
    engine.retryTiles();
    expect(tileMessage).toHaveBeenLastCalledWith("");
    const map = captured.maps[0];
    const removed = vi.fn();
    map.on("unload", removed);
    TestBed.resetTestingModule();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    TestBed.configureTestingModule({ providers: [LeafletMap] });
    engine = TestBed.inject(LeafletMap);
    engine.initialize(container, {
      viewportChanged,
      basemapChanged,
      tileMessage,
    });
    expect(container.querySelectorAll(".leaflet-map-pane")).toHaveLength(1);
  });
});
