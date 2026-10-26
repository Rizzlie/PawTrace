import type { z } from "zod";
import type { Coordinates } from "./case-values";

function orientation(a: Coordinates, b: Coordinates, c: Coordinates): number {
  return (
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude)
  );
}

function onSegment(
  a: Coordinates,
  b: Coordinates,
  point: Coordinates,
): boolean {
  return (
    orientation(a, b, point) === 0 &&
    point.latitude >= Math.min(a.latitude, b.latitude) &&
    point.latitude <= Math.max(a.latitude, b.latitude) &&
    point.longitude >= Math.min(a.longitude, b.longitude) &&
    point.longitude <= Math.max(a.longitude, b.longitude)
  );
}

function segmentsIntersect(
  a: Coordinates,
  b: Coordinates,
  c: Coordinates,
  d: Coordinates,
): boolean {
  return (
    (Math.sign(orientation(a, b, c)) * Math.sign(orientation(a, b, d)) < 0 &&
      Math.sign(orientation(c, d, a)) * Math.sign(orientation(c, d, b)) < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

/** A simple open ring: the last edge closes it, so the first vertex is not repeated. */
export function validatePolygon(
  polygon: { vertices: Coordinates[] },
  context: z.RefinementCtx,
): void {
  const { vertices } = polygon;
  if (
    new Set(vertices.map((vertex) => `${vertex.latitude},${vertex.longitude}`))
      .size !== vertices.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["vertices"],
      message:
        "Polygon vertices must be distinct; do not repeat the first vertex at the end.",
    });
    return;
  }
  const signedArea = vertices
    .slice(1, -1)
    .reduce(
      (sum, vertex, index) =>
        sum + orientation(vertices[0], vertex, vertices[index + 2]),
      0,
    );
  if (signedArea === 0) {
    context.addIssue({
      code: "custom",
      path: ["vertices"],
      message: "Polygon must enclose a nonzero area.",
    });
    return;
  }
  for (let first = 0; first < vertices.length; first++) {
    for (let second = first + 1; second < vertices.length; second++) {
      if (
        second === first + 1 ||
        (first === 0 && second === vertices.length - 1)
      )
        continue;
      if (
        segmentsIntersect(
          vertices[first],
          vertices[(first + 1) % vertices.length],
          vertices[second],
          vertices[(second + 1) % vertices.length],
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["vertices"],
          message:
            "Polygon edges must not intersect or touch except at adjacent endpoints.",
        });
        return;
      }
    }
  }
}
