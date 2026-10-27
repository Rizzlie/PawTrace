import { test } from './fixtures';
import { expect, type Page } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';

test.use({ timezoneId: 'Europe/Warsaw' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
});

test('routes the profile lazily and protects edits on browser Back', async ({ page }) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel('Imię', { exact: true }).fill('Szkic w trasie');
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Niezatwierdzony profil' })).toBeVisible();
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Szkic w trasie');
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Niezatwierdzony profil' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Szkic w trasie');
  await page.goBack();
  await page.getByRole('button', { name: 'Odrzuć szkic' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
});

async function exportCase(page: Page) {
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return caseFileSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}

async function importCase(page: Page, file: unknown) {
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Importuj JSON', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
}

test('can reopen the profile after cancelling case replacement with a clean editor', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
});

test('Back and Stay cancel pending replacement without discarding a dirty profile', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Zachowaj szkic');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Niezatwierdzony profil' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Zachowaj szkic');
  expect((await exportCase(page)).animal).toBeNull();
});

test('saves and restores an optional indoor-cat profile with distinct unknowns and negatives', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Luna');
  await page.getByLabel('Gatunek', { exact: true }).fill('Kot');
  await page.getByLabel('Wiek — wartość').fill('4');
  await page.getByLabel('Wiek przybliżony').check();
  await page.getByLabel('Kastracja / sterylizacja').selectOption('no');
  await page.getByLabel('Masa (kg)').fill('3,5');
  for (const [group, fields] of [
    [
      'Cechy rozpoznawcze',
      [
        ['Kolor sierści / upierzenia', 'Czarna'],
        ['Wzór umaszczenia', 'Biała plamka'],
        ['Wielkość', 'Mała'],
        ['Znaki szczególne', 'Blizna na uchu'],
        ['Obroża lub szelki', 'Brak obroży'],
        ['Numer mikroczipu', '123456789'],
      ],
    ],
    [
      'Zdrowie',
      [
        ['Choroby', 'Cukrzyca'],
        ['Urazy', 'Brak'],
        ['Ograniczenia ruchowe', 'Utyka'],
        ['Ograniczenia zmysłów', 'Słaby wzrok'],
        ['Leki', 'Insulina'],
      ],
    ],
    [
      'Zachowanie',
      [
        ['Temperament', 'Płochliwa'],
        ['Reakcje na ludzi', 'Unika obcych'],
        ['Reakcje na zwierzęta', 'Chowa się'],
        ['Lęki', 'Hałas'],
        ['Reakcja na wołanie', 'Reaguje na imię'],
        ['Sposoby wabienia', 'Szelest saszetki'],
        ['Ulubione jedzenie', 'Tuńczyk'],
      ],
    ],
    ['Dodatkowe informacje', [['Dodatkowe informacje o zwierzęciu', 'Nie gonić']]],
  ] as const) {
    await page.getByText(group, { exact: true }).click();
    for (const [label, value] of fields)
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  }
  await page.getByText('Zwyczaje i znajomość okolicy', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Wychodzenie', exact: true })
    .selectOption('indoor_only');
  await page.getByRole('combobox', { name: 'Znajomość okolicy', exact: true }).selectOption('no');
  await page.getByLabel('Zwykłe trasy', { exact: true }).fill('Korytarz');
  await page.getByLabel('Zwykłe miejsca', { exact: true }).fill('Parapet');
  await page.getByLabel('Poprzednie ucieczki', { exact: true }).fill('Nie uciekała');
  await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
  await page.getByLabel('Oryginalny opis czasu').fill('Wieczorem, nie znam godziny');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeHidden();
  const file = await exportCase(page);
  expect(file.animal).toMatchObject({
    name: 'Luna',
    species: 'Kot',
    neutered: false,
    microchipped: null,
    familiarWithArea: false,
    age: { value: 4, unit: 'years', approximate: true },
    weightKilograms: 3.5,
  });
  expect(file.case.escape.occurredAt).toEqual({
    kind: 'unknown',
    description: 'Wieczorem, nie znam godziny',
  });
  expect(file.animal).toMatchObject({
    coatColor: 'Czarna',
    coatPattern: 'Biała plamka',
    size: 'Mała',
    distinguishingFeatures: 'Blizna na uchu',
    collarHarness: 'Brak obroży',
    microchipNumber: '123456789',
    illnesses: 'Cukrzyca',
    injuries: 'Brak',
    mobilityLimitations: 'Utyka',
    sensoryLimitations: 'Słaby wzrok',
    medication: 'Insulina',
    temperament: 'Płochliwa',
    reactionsToPeople: 'Unika obcych',
    reactionsToAnimals: 'Chowa się',
    fears: 'Hałas',
    responseToCalls: 'Reaguje na imię',
    attractionMethods: 'Szelest saszetki',
    favoriteFood: 'Tuńczyk',
    usualRoutes: 'Korytarz',
    usualPlaces: 'Parapet',
    previousEscapes: 'Nie uciekała',
    additionalInformation: 'Nie gonić',
  });
  await page.reload();
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Luna');
  await expect(page.getByLabel('Wiek przybliżony')).toBeChecked();
  await page.getByRole('button', { name: 'Anuluj edycję' }).click();
  await importCase(page, file);
  const restored = await exportCase(page);
  expect(restored.animal).toEqual(file.animal);
  expect(restored.case.escape).toEqual(file.case.escape);
});

for (const { species, name, expected } of [
  { species: 'Papuga żako', name: 'parrot', expected: 'Papuga żako' },
  { species: '', name: 'unknown', expected: null },
]) {
  test(`round-trips an optional profile for species '${name}'`, async ({ page }) => {
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByLabel('Gatunek', { exact: true }).fill(species);
    await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
    await page.getByLabel('Oryginalny opis czasu').fill('Nie wiem kiedy');
    await expect(
      page.getByRole('region', { name: 'Profil zwierzęcia', exact: true }).getByRole('status'),
    ).toContainText('Niezatwierdzony szkic');
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeHidden();
    const file = await exportCase(page);
    expect(file.animal).toMatchObject({
      species: expected,
      age: null,
      weightKilograms: null,
      sex: null,
      neutered: null,
    });
    expect(file.case.escape).toEqual({
      occurredAt: { kind: 'unknown', description: 'Nie wiem kiedy' },
      escapePointId: null,
      description: null,
      directionOfTravel: null,
      familiarWithLocation: null,
    });
    await page.reload();
    await importCase(page, file);
    expect((await exportCase(page)).animal).toEqual(file.animal);
  });
}

test('edits imported incident and canonical point while retaining photos and map context', async ({
  page,
}) => {
  await importCase(page, completeFile);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Miejsce ucieczki', exact: true })).toHaveValue(
    'point-home',
  );
  await page
    .getByRole('combobox', { name: 'Miejsce ucieczki', exact: true })
    .selectOption('point-shed');
  await page.getByRole('combobox', { name: 'Dokładność czasu', exact: true }).selectOption('date');
  await page.getByLabel('Data zaginięcia', { exact: true }).fill('2026-10-25');
  await page.getByLabel('Sytuacja zaginięcia', { exact: true }).fill('Wyfrunęła przez okno');
  await page.getByLabel('Możliwy kierunek', { exact: true }).fill('Na północ');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeHidden();
  const file = await exportCase(page);
  expect(file.case.escape).toEqual({
    occurredAt: {
      kind: 'date',
      date: '2026-10-25',
      description: 'Około czternastej',
    },
    escapePointId: 'point-shed',
    description: 'Wyfrunęła przez okno',
    directionOfTravel: 'Na północ',
    familiarWithLocation: false,
  });
  expect(file.animal).toEqual(completeFile.animal);
  expect(file.points).toEqual(completeFile.points);
  expect(file.mapView).toEqual(completeFile.mapView);
  await page.reload();
  await importCase(page, file);
  expect((await exportCase(page)).case.escape).toEqual(file.case.escape);
});

test('protects drafts, excludes them from export, validates, and offers Save / Discard / Stay', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Szkic');
  expect((await exportCase(page)).animal).toBeNull();
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Szkic');
  await page.getByRole('button', { name: 'Zamknij profil' }).click();
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Masa (kg)').fill('-2');
  await expect(page.getByLabel('Masa (kg)')).toHaveValue('-2');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz i kontynuuj' }).click();
  await expect(page.getByRole('dialog')).toContainText('weightKilograms');
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Masa (kg)').fill('2');
  await page.getByRole('button', { name: 'Zamknij profil' }).click();
  await page.getByRole('button', { name: 'Zapisz i kontynuuj' }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeHidden();
  expect((await exportCase(page)).animal?.name).toBe('Szkic');
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Odrzucone');
  await page.getByRole('button', { name: 'Zamknij profil' }).click();
  await page.getByRole('button', { name: 'Odrzuć szkic' }).click();
  expect((await exportCase(page)).animal?.name).toBe('Szkic');
});

for (const { kind, fields, expected } of [
  {
    kind: 'exact',
    fields: [['Chwila zaginięcia', '2026-10-27T18:30']],
    expected: {
      kind: 'exact',
      at: '2026-10-27T17:30:00.000Z',
      description: 'Opis świadka',
    },
  },
  {
    kind: 'approximate',
    fields: [['Przybliżona chwila', '2026-10-27T18:00']],
    expected: {
      kind: 'approximate',
      at: '2026-10-27T17:00:00.000Z',
      description: 'Opis świadka',
    },
  },
  {
    kind: 'range',
    fields: [
      ['Początek przedziału', '2026-10-27T18:00'],
      ['Koniec przedziału', '2026-10-27T20:00'],
    ],
    expected: {
      kind: 'range',
      start: '2026-10-27T17:00:00.000Z',
      end: '2026-10-27T19:00:00.000Z',
      description: 'Opis świadka',
    },
  },
  {
    kind: 'range',
    fields: [['Koniec przedziału', '2026-10-27T20:00']],
    expected: {
      kind: 'range',
      start: null,
      end: '2026-10-27T19:00:00.000Z',
      description: 'Opis świadka',
    },
  },
] as const) {
  test(`retains incident precision ${kind} with ${fields.length} known endpoints`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Dokładność czasu', exact: true }).selectOption(kind);
    for (const [label, value] of fields) {
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
        'type',
        'datetime-local',
      );
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByLabel('Oryginalny opis czasu').fill('Opis świadka');
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeHidden();
    const file = await exportCase(page);
    expect(file.case.escape.occurredAt).toEqual(expected);
    await page.reload();
    await importCase(page, file);
    expect((await exportCase(page)).case.escape.occurredAt).toEqual(expected);
  });
}

test('rejects skipped hours and lets the user disambiguate a repeated hour', async ({ page }) => {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Dokładność czasu', exact: true }).selectOption('exact');
  const moment = page.getByLabel('Chwila zaginięcia', { exact: true });
  await moment.fill('2026-03-29T02:30');
  await expect(page.getByRole('alert')).toContainText('Ta godzina nie istnieje');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
  await moment.fill('2026-10-25T02:30');
  const occurrence = page.getByRole('combobox', {
    name: 'Chwila zaginięcia — wystąpienie godziny',
    exact: true,
  });
  await expect(occurrence).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
  await occurrence.selectOption('2026-10-25T01:30:00.000Z');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await exportCase(page)).case.escape.occurredAt).toEqual({
    kind: 'exact',
    at: '2026-10-25T01:30:00.000Z',
    description: null,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
  await expect(moment).toHaveValue('2026-10-25T02:30');
  await expect(occurrence).toHaveValue('2026-10-25T01:30:00.000Z');
});

test.describe('device zone differs from the case', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('shows the case wall time and preserves the original instant and offset on a profile edit', async ({
    page,
  }) => {
    await importCase(page, completeFile);
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByLabel('Imię', { exact: true }).fill('Nowe imię');
    await page.getByText('Okoliczności zaginięcia', { exact: true }).click();
    await expect(page.getByLabel('Przybliżona chwila', { exact: true })).toHaveValue(
      '2026-10-15T14:00',
    );
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await exportCase(page)).case.escape.occurredAt).toEqual(
      completeFile.case.escape.occurredAt,
    );
  });
});

for (const width of [390, 1280]) {
  test(`header shows the animal and keyboard-accessible JSON menu at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByLabel('Imię', { exact: true }).fill('Albert');
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    const header = page.getByRole('banner');
    await expect(header.getByText('Albert', { exact: true })).toBeVisible();
    const menu = header.getByRole('button', { name: 'Plik JSON', exact: true });
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Importuj JSON', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    const newCase = await header
      .getByRole('button', { name: 'Nowa sprawa', exact: true })
      .evaluate((element) => {
        const { x, y, width } = element.getBoundingClientRect();
        return { x, y, width };
      });
    const help = await header
      .getByRole('button', { name: 'Jak korzystać z mapy', exact: true })
      .evaluate((element) => {
        const { x, y } = element.getBoundingClientRect();
        return { x, y };
      });
    expect(newCase.x + newCase.width).toBeLessThanOrEqual(help.x);
    expect(Math.abs(newCase.y - help.y)).toBeLessThan(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await menu.click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Importuj JSON', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'case.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(completeFile)),
    });
    await expect(page.getByRole('dialog', { name: 'Zastąpienie sprawy' })).toBeVisible();
    await page.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(header.getByText('Albert', { exact: true })).toBeVisible();
  });
}
