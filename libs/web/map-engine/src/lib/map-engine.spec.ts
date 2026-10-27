import { TestBed } from '@angular/core/testing';
import { MapEngine } from './map-engine';
import { LeafletMap } from './leaflet-map';

describe('Map host and location on demand', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
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
    expect(firstHost.querySelector('.leaflet-map-pane')).not.toBeNull();
    expect(secondHost.querySelector('.leaflet-map-pane')).not.toBeNull();
    first.destroy();
    expect(firstHost.querySelector('.leaflet-map-pane')).toBeNull();
    expect(secondHost.querySelector('.leaflet-map-pane')).not.toBeNull();
    second.destroy();
    expect(secondHost.querySelector('.leaflet-map-pane')).toBeNull();
  });

  it('renders service signals directly and reacts to changing inputs', async () => {
    const fixture = TestBed.createComponent(MapEngine);
    fixture.componentRef.setInput('config', { mapboxToken: 'pk.test' });
    await fixture.whenStable();
    const map = fixture.debugElement.injector.get(LeafletMap);
    map.selectBasemap('satellite');
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain('Satelita');
    expect(host.querySelector('.mapbox-logo')).not.toBeNull();
    fixture.componentRef.setInput('config', { mapboxToken: '' });
    await fixture.whenStable();
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain('Mapa OSM');
    expect(host.querySelector('.mapbox-logo')).toBeNull();
  });

  it('explains unavailable geolocation', async () => {
    vi.stubGlobal('navigator', {});
    const fixture = TestBed.createComponent(MapEngine);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('.map-actions > button')?.click();
    await fixture.whenStable();
    expect(host.textContent).toContain('Lokalizacja jest niedostępna');
  });

  it('requests once on click, handles denial and ignores callbacks after destruction', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const fixture = TestBed.createComponent(MapEngine);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const button = host.querySelector<HTMLButtonElement>('.map-actions > button');
    if (!button) throw new Error('Location button missing');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    button.click();
    button.click();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const failure = getCurrentPosition.mock.calls[0][1];
    failure({ code: 1 });
    await fixture.whenStable();
    expect(host.textContent).toContain('Brak zgody na lokalizację');
    expect(button.disabled).toBe(false);
    fixture.destroy();
    expect(() => failure({ code: 1 })).not.toThrow();
  });
});

it('centers once from the requested startup mode without repeating after input changes', async () => {
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  try {
    const fixture = TestBed.createComponent(MapEngine);
    fixture.componentRef.setInput('initialLocation', 'center');
    await fixture.whenStable();
    const map = fixture.debugElement.injector.get(LeafletMap);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    getCurrentPosition.mock.calls[0][0]({
      coords: { latitude: 52.23, longitude: 21.01, accuracy: 25 },
    });
    expect(map.getViewport()).toMatchObject({
      latitude: 52.23,
      longitude: 21.01,
      zoom: 16,
    });
    fixture.componentRef.setInput('initialLocation', 'show');
    await fixture.whenStable();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    fixture.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('shows a late startup position without overriding a newer viewport', async () => {
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  try {
    const fixture = TestBed.createComponent(MapEngine);
    fixture.componentRef.setInput('initialLocation', 'center');
    await fixture.whenStable();
    const map = fixture.debugElement.injector.get(LeafletMap);
    const view = { latitude: 50, longitude: 19, zoom: 12 };
    fixture.componentRef.setInput('viewport', view);
    await fixture.whenStable();
    await vi.waitFor(() => expect(map.getViewport()).toMatchObject(view));
    getCurrentPosition.mock.calls[0][0]({
      coords: { latitude: 52.23, longitude: 21.01, accuracy: 25 },
    });
    expect(map.getViewport()).toMatchObject(view);
    expect(map.locationHint()).toContain('25 m');
    expect(map.locationMessage()).toBe('');
    fixture.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('does not recenter a late startup result after manual zoom', async () => {
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  try {
    const fixture = TestBed.createComponent(MapEngine);
    fixture.componentRef.setInput('initialLocation', 'center');
    await fixture.whenStable();
    const map = fixture.debugElement.injector.get(LeafletMap);
    const original = map.getViewport();
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLElement>('[title="Przybliż"]')?.click();
    await vi.waitFor(() => expect(map.getViewport().zoom).toBe(original.zoom + 1));
    const navigated = map.getViewport();
    getCurrentPosition.mock.calls[0][0]({
      coords: { latitude: 52.23, longitude: 21.01, accuracy: 25 },
    });
    expect(map.getViewport()).toEqual(navigated);
    fixture.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});
