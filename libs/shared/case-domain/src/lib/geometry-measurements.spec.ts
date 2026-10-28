import { groundDistance, geometryArea } from './geometry-measurements';
import { geometrySchema } from './case-values';

it('measures geographic ground units at the equator and in Poland', () => {
  expect(groundDistance({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
    111195,
    -1,
  );
  expect(
    groundDistance({ latitude: 52, longitude: 21 }, { latitude: 52, longitude: 22 }),
  ).toBeCloseTo(68458, -1);
  expect(
    geometryArea({ type: 'circle', center: { latitude: 52, longitude: 21 }, radiusMeters: 100 }),
  ).toBeCloseTo(31415.93, 1);
  expect(
    geometryArea({
      type: 'polygon',
      vertices: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ],
    }),
  ).toBeCloseTo(12363718145, -3);
});

it('rejects zero-radius, crossing and degenerate search plans', () => {
  expect(
    geometrySchema.safeParse({
      type: 'circle',
      center: { latitude: 52, longitude: 21 },
      radiusMeters: 0,
    }).success,
  ).toBe(false);
  expect(
    geometrySchema.safeParse({
      type: 'polygon',
      vertices: [
        { latitude: 52, longitude: 21 },
        { latitude: 53, longitude: 22 },
        { latitude: 54, longitude: 23 },
      ],
    }).success,
  ).toBe(false);
});
