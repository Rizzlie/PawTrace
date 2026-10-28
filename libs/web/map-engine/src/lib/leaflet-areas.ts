import * as L from 'leaflet';
import { groundDistance } from '@pawtrace/case-domain/geometry';
import type { SearchGeometry } from '@pawtrace/case-domain';
import type { AreaGeometryChange, MapArea, MapAreaDraft, MapCoordinates } from './map-types';

const latLng = (point: MapCoordinates): L.LatLngTuple => [point.latitude, point.longitude];
const label = (text: string): HTMLElement => {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
};
const coordinates = (point: L.LatLng): MapCoordinates => ({
  latitude: point.lat,
  longitude: point.wrap().lng,
});

/** Leaflet 1.9.4's free editor: only plain scene/draft inputs and technical intents cross this seam. */
export class LeafletAreas {
  private readonly plans = new Map<
    string,
    { layer: L.Circle | L.Polygon; geometry: SearchGeometry }
  >();
  private readonly working = L.layerGroup();
  private draft: MapAreaDraft | null = null;
  private measurement: MapCoordinates[] | null = null;
  private destroyed = false;
  constructor(
    private readonly map: L.Map,
    private readonly intents: {
      changed: (change: AreaGeometryChange) => void;
      selected: (id: string) => void;
      measured: (points: MapCoordinates[]) => void;
    },
  ) {
    this.working.addTo(map);
  }

  render(areas: MapArea[], draft: MapAreaDraft | null, measurement: MapCoordinates[] | null): void {
    if (this.destroyed) return;
    const visible = areas.filter((area) => area.id !== draft?.areaId);
    const ids = new Set(visible.map((area) => area.id));
    for (const [id, entry] of this.plans)
      if (!ids.has(id)) {
        entry.layer.remove().off();
        this.plans.delete(id);
      }
    for (const area of visible) {
      const existing = this.plans.get(area.id);
      if (!existing || existing.geometry.type !== area.geometry.type) {
        existing?.layer.remove().off();
        const layer = this.shape(area.geometry, true);
        layer.bindTooltip(label(area.name));
        layer.on('click', (event: L.LeafletMouseEvent) => {
          if (!this.pick(event.latlng)) this.intents.selected(area.id);
        });
        layer.addTo(this.map);
        this.plans.set(area.id, { layer, geometry: area.geometry });
      }
      const entry = this.plans.get(area.id);
      if (entry && entry.geometry !== area.geometry) {
        if (entry.layer instanceof L.Circle && area.geometry.type === 'circle') {
          entry.layer.setLatLng(latLng(area.geometry.center));
          entry.layer.setRadius(area.geometry.radiusMeters);
        } else if (entry.layer instanceof L.Polygon && area.geometry.type === 'polygon') {
          entry.layer.setLatLngs(area.geometry.vertices.map(latLng));
        }
        entry.geometry = area.geometry;
      }
      entry?.layer.setTooltipContent(label(area.name));
      entry?.layer.setStyle({
        color: area.selected ? '#234e3b' : '#587949',
        weight: area.selected ? 4 : 2,
        fillOpacity: area.selected ? 0.22 : 0.1,
      });
    }
    if (this.draft === draft && this.measurement === measurement) return;
    this.draft = draft;
    this.measurement = measurement;
    this.working.eachLayer((layer) => layer.off());
    this.working.clearLayers();
    if (measurement) {
      L.polyline(measurement.map(latLng), {
        color: '#665699',
        dashArray: '6 6',
        interactive: false,
      }).addTo(this.working);
      measurement.forEach((point, index) =>
        this.handle(point, `Pomiar ${index + 1}`, (next) =>
          this.intents.measured(
            measurement.map((current, position) => (position === index ? next : current)),
          ),
        ),
      );
      return;
    }
    if (!draft) return;
    const points = draft.vertices;
    if (draft.type === 'polygon') {
      if (points.length >= 2)
        (points.length >= 3
          ? L.polygon(points.map(latLng), { interactive: false, color: '#c56c28' })
          : L.polyline(points.map(latLng), { interactive: false, color: '#c56c28' })
        ).addTo(this.working);
      points.forEach((point, index) =>
        this.handle(point, `Wierzchołek ${index + 1}`, (next) =>
          this.change(
            draft,
            points.map((current, position) => (position === index ? next : current)),
            draft.radiusMeters,
          ),
        ),
      );
    } else if (points[0]) {
      const radius =
        Number.isFinite(draft.radiusMeters) && draft.radiusMeters > 0 ? draft.radiusMeters : 0;
      if (radius)
        this.shape({ type: 'circle', center: points[0], radiusMeters: radius }, false).addTo(
          this.working,
        );
      this.handle(points[0], 'Środek koła', (next) =>
        this.change(draft, [next], draft.radiusMeters),
      );
      if (radius)
        this.handle(this.circleEdge(points[0], radius), 'Promień koła', (next) =>
          this.change(draft, points, groundDistance(points[0], next)),
        );
    }
  }

  /** A click, including on an existing place, belongs to the active technical mode. */
  pick(point: L.LatLng): boolean {
    if (this.destroyed) return false;
    const next = coordinates(L.latLng(point.lat, point.lng));
    if (this.measurement) {
      this.intents.measured(this.measurement.length < 2 ? [...this.measurement, next] : [next]);
      return true;
    }
    const draft = this.draft;
    if (!draft) return false;
    if (draft.type === 'polygon') this.change(draft, [...draft.vertices, next], draft.radiusMeters);
    else if (!draft.vertices.length) this.change(draft, [next], 0);
    else this.change(draft, draft.vertices, groundDistance(draft.vertices[0], next));
    return true;
  }
  destroy(): void {
    this.destroyed = true;
    this.working.eachLayer((layer) => layer.off());
    this.working.clearLayers();
    this.working.remove();
    for (const entry of this.plans.values()) entry.layer.remove().off();
    this.plans.clear();
    this.draft = null;
    this.measurement = null;
  }
  private change(draft: MapAreaDraft, vertices: MapCoordinates[], radiusMeters: number): void {
    if (!this.destroyed && this.draft?.sessionId === draft.sessionId)
      this.intents.changed({ sessionId: draft.sessionId, vertices, radiusMeters });
  }
  private shape(geometry: SearchGeometry, interactive: boolean): L.Circle | L.Polygon {
    return geometry.type === 'circle'
      ? L.circle(latLng(geometry.center), {
          radius: geometry.radiusMeters,
          color: '#c56c28',
          interactive,
          bubblingMouseEvents: false,
        })
      : L.polygon(geometry.vertices.map(latLng), { interactive, bubblingMouseEvents: false });
  }
  private handle(
    point: MapCoordinates,
    title: string,
    moved: (point: MapCoordinates) => void,
  ): void {
    const element = document.createElement('span');
    element.style.cssText =
      'display:block;width:24px;height:24px;border:3px solid white;border-radius:50%;background:#c56c28;box-shadow:0 1px 6px #0008;box-sizing:border-box';
    const marker = L.marker(latLng(point), {
      title,
      draggable: true,
      bubblingMouseEvents: false,
      icon: L.divIcon({
        className: 'pt-geometry-handle',
        html: element,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(this.working);
    marker.on('dragend', () => {
      if (!this.destroyed) moved(coordinates(marker.getLatLng()));
    });
  }
  private circleEdge(center: MapCoordinates, radius: number): MapCoordinates {
    const latitude = (center.latitude * Math.PI) / 180;
    const angle = radius / 6371008.8;
    return {
      latitude: (Math.asin(Math.sin(latitude) * Math.cos(angle)) * 180) / Math.PI,
      longitude: L.latLng(
        0,
        center.longitude +
          (Math.atan2(
            Math.sin(angle) * Math.cos(latitude),
            Math.cos(angle) - Math.sin(latitude) ** 2 * Math.cos(angle),
          ) *
            180) /
            Math.PI,
      ).wrap().lng,
    };
  }
}
