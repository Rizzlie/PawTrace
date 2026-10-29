import type { EventTime, HistoryEntry, SearchResult, MapPoint } from '@pawtrace/case-domain';
export const entryTypes = {
  observation: 'Obserwacja',
  action: 'Działanie',
  check: 'Kontrola',
  note: 'Notatka',
} satisfies Record<HistoryEntry['type'], string>;
export const identifications = {
  target_animal: 'Szukane zwierzę',
  uncertain: 'Niepewne',
  different_animal: 'Inne zwierzę',
} as const;
export const sources = {
  personal_observation: 'Własna obserwacja',
  another_person: 'Relacja innej osoby',
  surveillance: 'Nagranie / fotopułapka',
  other: 'Inne źródło',
} as const;
export const actionKinds = {
  food_placement: 'Wyłożenie karmy',
  food_refill: 'Uzupełnienie karmy',
  trail_camera_setup: 'Ustawienie fotopułapki',
  other: 'Inne działanie',
} as const;
export const foodStates = {
  present: 'Karma obecna',
  partially_eaten: 'Częściowo zjedzona',
  absent: 'Karma nieobecna',
} as const;
export const foodUnits = {
  grams: 'g',
  kilograms: 'kg',
  milliliters: 'ml',
  liters: 'l',
  portions: 'porcje',
} as const;
export const searchResults = {
  no_animal_or_signs: 'Nie zauważono zwierzęcia ani śladów',
  possible_signs: 'Możliwe ślady',
  animal_seen: 'Widziano zwierzę',
  animal_secured: 'Zwierzę odnalezione i zabezpieczone',
  unable_to_check: 'Nie udało się sprawdzić',
  other_or_inconclusive: 'Inny / niejednoznaczny wynik',
} satisfies Record<SearchResult, string>;
export const options = <T extends string>(labels: Record<T, string>) =>
  Object.entries<string>(labels).map(([value, label]) => ({ value, label }));
export function eventTimeLabel(time: EventTime, timeZone: string): string {
  const moment = (value: string) =>
    new Intl.DateTimeFormat('pl', { timeZone, dateStyle: 'short', timeStyle: 'medium' }).format(
      new Date(value),
    );
  switch (time.kind) {
    case 'unknown':
      return 'Nieznany czas';
    case 'date':
      return `Tylko data: ${time.date}`;
    case 'exact':
      return `Dokładnie: ${moment(time.at)}`;
    case 'approximate':
      return `Około: ${moment(time.at)}`;
    case 'range':
      return `Przedział: ${time.start ? moment(time.start) : 'nieznany początek'} — ${time.end ? moment(time.end) : 'nieznany koniec'}`;
  }
}
export function entryDetails(entry: HistoryEntry): string[] {
  switch (entry.type) {
    case 'observation':
      return [
        entry.source ? sources[entry.source] : 'Źródło nieznane',
        entry.sourceDescription,
        entry.uncertaintyRadiusMeters
          ? `Przybliżone położenie: promień ${entry.uncertaintyRadiusMeters} m`
          : null,
        entry.status === 'rejected' ? `Relacja odrzucona: ${entry.rejectionReason}` : null,
      ].filter((v): v is string => !!v);
    case 'action':
      return [
        entry.details?.kind ? actionKinds[entry.details.kind] : null,
        entry.details?.foodType,
        entry.details?.foodQuantity
          ? `${entry.details.foodQuantity.value} ${foodUnits[entry.details.foodQuantity.unit]}`
          : null,
      ].filter((v): v is string => !!v);
    case 'check':
      return [
        entry.result ? searchResults[entry.result] : null,
        entry.method,
        entry.details?.foodStatus ? foodStates[entry.details.foodStatus] : null,
        entry.observationEntryId ? `Powiązana obserwacja: ${entry.observationEntryId}` : null,
      ].filter((v): v is string => !!v);
    case 'note':
      return [];
  }
}

/** A sighting has one identity, shared by checks in both histories. */
export function observationOptions(points: readonly MapPoint[]) {
  return points.flatMap((point) =>
    point.entries
      .filter((entry) => entry.type === 'observation')
      .map((entry) => ({
        id: entry.id,
        label: `${point.name} — ${entry.description ?? entry.id} (${identifications[entry.identification]})`,
      })),
  );
}
