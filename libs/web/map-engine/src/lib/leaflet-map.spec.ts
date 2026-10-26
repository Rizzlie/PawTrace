import { LeafletMap } from "./leaflet-map";

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
    engine = new LeafletMap(container, {
      viewportChanged,
      basemapChanged,
      tileMessage,
    });
  });
  afterEach(() => {
    engine.destroy();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts over Poland and preserves view through both basemap switches", () => {
    expect(engine.getViewport().latitude).toBeGreaterThan(49);
    expect(engine.getViewport().latitude).toBeLessThan(55);
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    engine.restoreViewport(view);
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

  it("emits completed user navigation but suppresses restore and resize", () => {
    engine.restoreViewport({ latitude: 52, longitude: 20, zoom: 10 });
    resize();
    expect(viewportChanged).not.toHaveBeenCalled();
    captured.maps[0].panTo([53, 21], { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
    expect(viewportChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitude: 53, longitude: 21 }),
    );
  });

  it("does not request satellite tiles without credentials", () => {
    engine.selectBasemap("satellite");
    expect(captured.layers).toHaveLength(1);
    expect(tileMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("tokenu Mapbox"),
    );
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
    engine.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    engine = new LeafletMap(container, {
      viewportChanged,
      basemapChanged,
      tileMessage,
    });
    expect(container.querySelectorAll(".leaflet-map-pane")).toHaveLength(1);
  });
});
