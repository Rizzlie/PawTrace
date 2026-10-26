import { TestBed } from "@angular/core/testing";
import { MapEngine } from "./map-engine";

vi.mock("./leaflet-map", () => ({
  LeafletMap: class {
    configure = vi.fn();
    restoreViewport = vi.fn();
    destroy = vi.fn();
  },
}));

describe("Location on demand", () => {
  afterEach(() => vi.unstubAllGlobals());
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
