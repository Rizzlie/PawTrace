import { TestBed } from "@angular/core/testing";
import { MapEngine } from "./map-engine";
import { LeafletMap } from "./leaflet-map";

const lifecycle = vi.hoisted(() => ({ destroy: vi.fn() }));
vi.mock("./leaflet-map", () => ({
  LeafletMap: class {
    initialize = vi.fn();
    configure = vi.fn();
    restoreViewport = vi.fn();
    ngOnDestroy() {
      lifecycle.destroy(this);
    }
  },
}));

describe("Location on demand", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());
  it("provides one map service per host and destroys only that host's instance", async () => {
    const first = TestBed.createComponent(MapEngine);
    const second = TestBed.createComponent(MapEngine);
    await Promise.all([first.whenStable(), second.whenStable()]);
    const firstMap = first.debugElement.injector.get(LeafletMap);
    const secondMap = second.debugElement.injector.get(LeafletMap);
    expect(firstMap).not.toBe(secondMap);
    expect(firstMap.initialize).toHaveBeenCalledOnce();
    expect(secondMap.initialize).toHaveBeenCalledOnce();
    first.destroy();
    expect(lifecycle.destroy).toHaveBeenCalledTimes(1);
    expect(lifecycle.destroy).toHaveBeenLastCalledWith(firstMap);
    second.destroy();
    expect(lifecycle.destroy).toHaveBeenCalledTimes(2);
    expect(lifecycle.destroy).toHaveBeenLastCalledWith(secondMap);
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
  it("requests once on click, handles denial, and ignores a late callback after destruction", async () => {
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
