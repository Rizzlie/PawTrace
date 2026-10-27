import { LeafletMap } from './leaflet-map';
import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import type { Basemap, MapConfig, MapViewport, MapPlace, MapPointDraft } from './map-types';

const captured = vi.hoisted(() => ({
  layers: [] as import('leaflet').TileLayer[],
  maps: [] as import('leaflet').Map[],
  markers: [] as import('leaflet').Marker[],
}));
vi.mock('leaflet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('leaflet')>();
  return {
    ...actual,
    marker: (...args: Parameters<typeof actual.marker>) => {
      const marker = actual.marker(...args);
      captured.markers.push(marker);
      return marker;
    },
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

describe('Reactive Leaflet integration', () => {
  let engine: LeafletMap;
  let container: HTMLDivElement;
  let config: WritableSignal<MapConfig>;
  let viewport: WritableSignal<MapViewport | undefined>;
  let places: WritableSignal<MapPlace[]>;
  let pointDraft: WritableSignal<MapPointDraft | null>;
  const pointPlaced = vi.fn();
  const placesSelected = vi.fn();
  const viewportChanged = vi.fn();
  const disconnect = vi.fn();
  let resize: () => void;
  const restoreViewport = (view: MapViewport) => {
    viewport.set(view);
    TestBed.tick();
  };
  const configure = (value: MapConfig) => {
    config.set(value);
    TestBed.tick();
  };
  const selectBasemap = (basemap: Basemap) => {
    engine.selectBasemap(basemap);
    TestBed.tick();
  };
  const retryTiles = () => {
    engine.retryTiles();
    TestBed.tick();
  };
  const initialize = () => {
    TestBed.configureTestingModule({ providers: [LeafletMap] });
    engine = TestBed.inject(LeafletMap);
    engine.initialize(container, {
      config,
      viewport,
      viewportChanged,
      places,
      pointDraft,
      pointPlaced,
      placesSelected,
    });
    TestBed.tick();
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    captured.layers.length = 0;
    captured.maps.length = 0;
    captured.markers.length = 0;
    places = signal<MapPlace[]>([]);
    pointDraft = signal<MapPointDraft | null>(null);
    config = signal<MapConfig>({ mapboxToken: '' });
    viewport = signal<MapViewport | undefined>(undefined);
    vi.stubGlobal(
      'ResizeObserver',
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
    container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { value: 1100 },
      clientHeight: { value: 700 },
    });
    document.body.append(container);
    initialize();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('emits geographic draft intents only in editing mode and reconciles stable markers', () => {
    const map = captured.maps[0];
    map.fire('click', { latlng: { lat: 52, lng: 21 } });
    expect(pointPlaced).not.toHaveBeenCalled();
    places.set([
      {
        id: 'home',
        name: 'Dom',
        number: 1,
        coordinates: { latitude: 52, longitude: 21 },
        selected: false,
      },
    ]);
    TestBed.tick();
    const committed = captured.markers[0];
    pointDraft.set({
      sessionId: 7,
      pointId: 'home',
      number: 1,
      coordinates: { latitude: 51, longitude: 20 },
    });
    TestBed.tick();
    map.fire('click', { latlng: { lat: 52.5, lng: 381 } });
    expect(pointPlaced).toHaveBeenLastCalledWith({
      sessionId: 7,
      coordinates: { latitude: 52.5, longitude: 21 },
    });
    const draft = captured.markers[1];
    draft.setLatLng([50.5, 19.5]).fire('dragend');
    expect(pointPlaced).toHaveBeenLastCalledWith({
      sessionId: 7,
      coordinates: { latitude: 50.5, longitude: 19.5 },
    });
    pointDraft.set(null);
    TestBed.tick();
    expect(map.hasLayer(draft)).toBe(false);
    expect(map.hasLayer(committed)).toBe(true);
    expect(committed.getLatLng()).toMatchObject({ lat: 52, lng: 21 });
    const count = pointPlaced.mock.calls.length;
    draft.fire('dragend');
    expect(pointPlaced).toHaveBeenCalledTimes(count);
  });

  it('offers the names of overlapping places without zooming', () => {
    places.set(
      ['a', 'b'].map((id, index) => ({
        id,
        name: id,
        number: index + 1,
        coordinates: { latitude: 52, longitude: 21 },
        selected: false,
      })),
    );
    TestBed.tick();
    const zoom = engine.getViewport().zoom;
    captured.markers[0].fire('click');
    expect(placesSelected).toHaveBeenLastCalledWith(['a', 'b']);
    expect(engine.getViewport().zoom).toBe(zoom);
  });

  it('renders place numbers and updates the surviving marker after renumbering', () => {
    places.set(
      ['a', 'b'].map((id, index) => ({
        id,
        name: id,
        number: index + 1,
        coordinates: { latitude: 52 + index, longitude: 21 },
        selected: false,
      })),
    );
    TestBed.tick();
    const first = captured.markers[0];
    const second = captured.markers[1];
    expect(first.getElement()?.textContent).toBe('1');
    expect(second.getElement()?.textContent).toBe('2');
    places.update((current) =>
      current.filter((place) => place.id === 'b').map((place) => ({ ...place, number: 1 })),
    );
    TestBed.tick();
    expect(captured.maps[0].hasLayer(first)).toBe(false);
    expect(captured.maps[0].hasLayer(second)).toBe(true);
    expect(second.getElement()?.textContent).toBe('1');
  });

  it('starts over Poland and preserves view through both basemap switches', async () => {
    expect(engine.getViewport().latitude).toBeGreaterThan(49);
    expect(engine.getViewport().latitude).toBeLessThan(55);
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    restoreViewport(view);
    await vi.advanceTimersByTimeAsync(20);
    configure({ mapboxToken: 'pk.controlled-test' });
    selectBasemap('satellite');
    const layer = captured.layers[captured.layers.length - 1];
    expect(layer.options.tileSize).toBe(512);
    expect(layer.options.zoomOffset).toBe(-1);
    expect(engine.getViewport()).toEqual(view);
    selectBasemap('osm');
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Improve this map');
    captured.maps[0].setZoom(14, { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
  });

  it('emits completed user navigation but suppresses restore and resize', async () => {
    restoreViewport({ latitude: 52, longitude: 20, zoom: 10 });
    await vi.advanceTimersByTimeAsync(20);
    resize();
    expect(viewportChanged).not.toHaveBeenCalled();
    captured.maps[0].panTo([53, 21], { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
    expect(viewportChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitude: 53, longitude: 21 }),
    );
  });

  it('restores the latest viewport after an in-flight animated zoom without emitting an edit', async () => {
    const map = captured.maps[0];
    // Exercise Leaflet's actual CSS animation path/timer in jsdom.
    map.fire('zoomstart');
    Reflect.apply(Reflect.get(map, '_animateZoom'), map, [map.getCenter(), 8, true]);
    restoreViewport({ latitude: 51, longitude: 19, zoom: 11 });
    const latestView = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    restoreViewport(latestView);
    resize();
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getViewport()).toEqual(latestView);
    expect(viewportChanged).not.toHaveBeenCalled();
    map.panTo([53, 21], { animate: false });
    expect(viewportChanged).toHaveBeenCalledTimes(1);
  });

  it('restores after a zoom queued for the next animation frame', async () => {
    const map = captured.maps[0];
    requestAnimationFrame(() => {
      map.fire('zoomstart');
      Reflect.apply(Reflect.get(map, '_animateZoom'), map, [map.getCenter(), 8, true]);
    });
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    restoreViewport(view);
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
  });

  it('exposes missing-credential state without requesting satellite tiles', () => {
    expect(engine.satelliteAvailable()).toBe(false);
    selectBasemap('satellite');
    expect(captured.layers).toHaveLength(1);
    expect(engine.basemap()).toBe('osm');
    expect(engine.tileMessage()).toContain('tokenu Mapbox');
  });

  it('updates computed availability and resets an unavailable selection without automatically retrying it', () => {
    configure({ mapboxToken: 'pk.test' });
    expect(engine.satelliteAvailable()).toBe(true);
    selectBasemap('satellite');
    expect(engine.basemap()).toBe('satellite');
    expect(engine.showMapboxLogo()).toBe(true);
    configure({ mapboxToken: '' });
    expect(engine.basemap()).toBe('osm');
    expect(engine.showMapboxLogo()).toBe(false);
    configure({ mapboxToken: 'pk.test' });
    expect(engine.basemap()).toBe('osm');
  });

  it('updates the active source and attribution without changing viewport', async () => {
    const view = { latitude: 52.23, longitude: 21.01, zoom: 13 };
    restoreViewport(view);
    await vi.advanceTimersByTimeAsync(20);
    const value: MapConfig = {
      mapboxToken: 'pk.test&value',
      osm: {
        urlTemplate: 'https://maps.example.test/street/{z}/{x}/{y}',
        attribution: 'Street provider',
      },
      satellite: {
        urlTemplate: 'https://maps.example.test/satellite/{z}/{x}/{y}?token={accessToken}',
        attribution: 'Satellite provider',
      },
    };
    configure(value);
    expect(container.querySelector<HTMLImageElement>('img.leaflet-tile')?.src).toContain(
      'maps.example.test/street/',
    );
    expect(container.textContent).toContain('Street provider');
    selectBasemap('satellite');
    expect(container.querySelector<HTMLImageElement>('img.leaflet-tile')?.src).toContain(
      'token=pk.test%26value',
    );
    expect(container.textContent).toContain('Satellite provider');
    expect(engine.showMapboxLogo()).toBe(false);
    configure({
      ...value,
      satellite: {
        ...value.satellite,
        urlTemplate: 'https://maps.example.test/satellite/{z}/{x}/{y}?token={accessToken}',
        attribution: 'Updated provider',
      },
    });
    expect(container.textContent).toContain('Updated provider');
    expect(container.textContent).not.toContain('Satellite provider');
    expect(engine.getViewport()).toEqual(view);
    expect(viewportChanged).not.toHaveBeenCalled();
  });

  it('keeps tiles in place through status changes, equivalent inputs and inactive source changes', () => {
    const originalLayer = captured.layers[0];
    expect(engine.loading()).toBe(true);
    originalLayer.fire('load');
    expect(engine.loading()).toBe(false);
    TestBed.tick();
    originalLayer.fire('tileerror');
    TestBed.tick();
    expect(engine.tileMessage()).toContain('Nie udało');
    configure({
      mapboxToken: 'pk.test',
      satellite: {
        urlTemplate: 'https://maps.example.test/{z}/{x}/{y}',
        attribution: 'Satellite provider',
      },
    });
    configure({ ...config() });
    expect(captured.layers).toHaveLength(1);
    retryTiles();
    expect(captured.layers).toHaveLength(2);
    expect(engine.tileMessage()).toBe('');
  });

  it('resets a source error declaratively when its configuration changes', () => {
    captured.layers[0].fire('tileerror');
    expect(engine.tileMessage()).toContain('Nie udało');
    configure({
      mapboxToken: '',
      osm: {
        urlTemplate: 'https://maps.example.test/{z}/{x}/{y}',
        attribution: 'Replacement provider',
      },
    });
    expect(engine.tileMessage()).toBe('');
    expect(container.textContent).toContain('Replacement provider');
  });

  it('sanitizes configured attribution before Leaflet inserts it', () => {
    configure({
      mapboxToken: '',
      osm: {
        urlTemplate: 'https://maps.example.test/{z}/{x}/{y}',
        attribution:
          '<a href="https://maps.example.test/" onclick="alert(1)">Provider</a><script>alert(1)</script>',
      },
    });
    const link = container.querySelector('a[href="https://maps.example.test/"]');
    expect(link?.textContent).toBe('Provider');
    expect(link?.hasAttribute('onclick')).toBe(false);
    expect(container.querySelector('script')).toBeNull();
  });

  it('cancels pending restoration when Angular destroys the map service', async () => {
    restoreViewport({ latitude: 52, longitude: 21, zoom: 12 });
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(500);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.querySelector('.leaflet-map-pane')).toBeNull();
  });

  it('lets active zoom finish safely when destroyed during restoration', async () => {
    const map = captured.maps[0];
    map.fire('zoomstart');
    Reflect.apply(Reflect.get(map, '_animateZoom'), map, [map.getCenter(), 8, true]);
    restoreViewport({ latitude: 52, longitude: 21, zoom: 13 });
    await vi.advanceTimersByTimeAsync(20);
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(500);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(container.querySelector('.leaflet-map-pane')).toBeNull();
  });

  it('falls back once after satellite error and ignores stale layer events', () => {
    configure({ mapboxToken: 'pk.test' });
    selectBasemap('satellite');
    const satellite = captured.layers[captured.layers.length - 1];
    satellite.fire('tileerror');
    TestBed.tick();
    expect(engine.basemap()).toBe('osm');
    expect(engine.tileMessage()).toContain('Przywrócono');
    const count = captured.layers.length;
    satellite.fire('tileerror');
    vi.advanceTimersByTime(16000);
    TestBed.tick();
    expect(captured.layers).toHaveLength(count);
  });

  it('falls back when satellite requests hang', () => {
    configure({ mapboxToken: 'pk.test' });
    selectBasemap('satellite');
    vi.advanceTimersByTime(15000);
    TestBed.tick();
    expect(engine.basemap()).toBe('osm');
  });

  it('recovers from OSM failure and releases resources so the container can be reused', () => {
    captured.layers[0].fire('tileerror');
    expect(engine.tileMessage()).toContain('Nie udało');
    retryTiles();
    expect(engine.tileMessage()).toBe('');
    const removed = vi.fn();
    captured.maps[0].on('unload', removed);
    TestBed.resetTestingModule();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    initialize();
    expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(1);
  });
});
