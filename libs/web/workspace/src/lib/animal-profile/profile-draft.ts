import type { AnimalProfile, CaseDocument, EventTime } from '@pawtrace/case-domain';
import { localIncidentMoment, resolveIncidentMoment } from './incident-time';

/** Labels and groups share the same text-field vocabulary as the document. */
export const profileTextGroups = [
  {
    id: 'basics',
    title: 'Podstawowe informacje',
    fields: [
      { key: 'name', label: 'Imię' },
      { key: 'species', label: 'Gatunek' },
      { key: 'breed', label: 'Rasa lub typ' },
    ],
  },
  {
    id: 'identification',
    title: 'Cechy rozpoznawcze',
    fields: [
      { key: 'coatColor', label: 'Kolor sierści / upierzenia' },
      { key: 'coatPattern', label: 'Wzór umaszczenia' },
      { key: 'size', label: 'Wielkość' },
      { key: 'distinguishingFeatures', label: 'Znaki szczególne' },
      { key: 'collarHarness', label: 'Obroża lub szelki' },
      { key: 'microchipNumber', label: 'Numer mikroczipu' },
    ],
  },
  {
    id: 'health',
    title: 'Zdrowie',
    fields: [
      { key: 'illnesses', label: 'Choroby' },
      { key: 'injuries', label: 'Urazy' },
      { key: 'mobilityLimitations', label: 'Ograniczenia ruchowe' },
      { key: 'sensoryLimitations', label: 'Ograniczenia zmysłów' },
      { key: 'medication', label: 'Leki' },
    ],
  },
  {
    id: 'behavior',
    title: 'Zachowanie',
    fields: [
      { key: 'temperament', label: 'Temperament' },
      { key: 'reactionsToPeople', label: 'Reakcje na ludzi' },
      { key: 'reactionsToAnimals', label: 'Reakcje na zwierzęta' },
      { key: 'fears', label: 'Lęki' },
      { key: 'responseToCalls', label: 'Reakcja na wołanie' },
      { key: 'attractionMethods', label: 'Sposoby wabienia' },
      { key: 'favoriteFood', label: 'Ulubione jedzenie' },
    ],
  },
  {
    id: 'habits',
    title: 'Zwyczaje i znajomość okolicy',
    fields: [
      { key: 'usualRoutes', label: 'Zwykłe trasy' },
      { key: 'usualPlaces', label: 'Zwykłe miejsca' },
      { key: 'previousEscapes', label: 'Poprzednie ucieczki' },
    ],
  },
  {
    id: 'additional',
    title: 'Dodatkowe informacje',
    fields: [
      {
        key: 'additionalInformation',
        label: 'Dodatkowe informacje o zwierzęciu',
      },
    ],
  },
] as const;

type TextKey = (typeof profileTextGroups)[number]['fields'][number]['key'];
export type Answer = '' | 'yes' | 'no';
export interface ProfileDraft {
  animal: Record<TextKey, string> & {
    sex: '' | NonNullable<AnimalProfile['sex']>;
    neutered: Answer;
    microchipped: Answer;
    familiarWithArea: Answer;
    outdoorAccess: '' | NonNullable<AnimalProfile['outdoorAccess']>;
    weightKilograms: string;
    age: { value: string; unit: 'months' | 'years'; approximate: boolean };
  };
  escape: {
    time: {
      kind: EventTime['kind'];
      at: string;
      atInstant: string;
      start: string;
      startInstant: string;
      end: string;
      endInstant: string;
      date: string;
      description: string;
    };
    escapePointId: string;
    description: string;
    directionOfTravel: string;
    familiarWithLocation: Answer;
  };
}

const answer = (value: boolean | null | undefined): Answer =>
  value == null ? '' : value ? 'yes' : 'no';
const booleanValue = (value: Answer) => (value === '' ? null : value === 'yes');
const textValue = (value: string) => value.trim() || null;
const numberValue = (value: string) => {
  const text = value.trim().replace(',', '.');
  return text === '' ? null : /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
};
const textKeys = profileTextGroups.flatMap((group) => group.fields.map((field) => field.key));

export function createProfileDraft(document: CaseDocument): ProfileDraft {
  const animal = document.animal;
  const escape = document.case.escape;
  const time = escape.occurredAt;
  const zone = document.case.timeZone;
  const at = localIncidentMoment('at' in time ? time.at : null, zone);
  const start = localIncidentMoment('start' in time ? time.start : null, zone);
  const end = localIncidentMoment('end' in time ? time.end : null, zone);
  return {
    animal: {
      ...(Object.fromEntries(textKeys.map((key) => [key, animal?.[key] ?? ''])) as Record<
        TextKey,
        string
      >),
      sex: animal?.sex ?? '',
      neutered: answer(animal?.neutered),
      microchipped: answer(animal?.microchipped),
      familiarWithArea: answer(animal?.familiarWithArea),
      outdoorAccess: animal?.outdoorAccess ?? '',
      weightKilograms: animal?.weightKilograms?.toString() ?? '',
      age: {
        value: animal?.age?.value.toString() ?? '',
        unit: animal?.age?.unit ?? 'years',
        approximate: animal?.age?.approximate ?? false,
      },
    },
    escape: {
      time: {
        kind: time.kind,
        at: at.local,
        atInstant: at.instant,
        start: start.local,
        startInstant: start.instant,
        end: end.local,
        endInstant: end.instant,
        date: 'date' in time ? time.date : '',
        description: time.description ?? '',
      },
      escapePointId: escape.escapePointId ?? '',
      description: escape.description ?? '',
      directionOfTravel: escape.directionOfTravel ?? '',
      familiarWithLocation: answer(escape.familiarWithLocation),
    },
  };
}

/** Input conversion is explicit; the shared validator still checks the whole result. */
export function applyProfileDraft(document: CaseDocument, draft: ProfileDraft): CaseDocument {
  const { animal, escape } = draft;
  const { time } = escape;
  const description = textValue(time.description);
  const zone = document.case.timeZone;
  const original = document.case.escape.occurredAt;
  const occurredAt: EventTime =
    time.kind === 'exact' || time.kind === 'approximate'
      ? {
          kind: time.kind,
          at: resolveIncidentMoment(
            time.at,
            time.atInstant,
            zone,
            'at' in original ? original.at : null,
          ),
          description,
        }
      : time.kind === 'range'
        ? {
            kind: 'range',
            start:
              time.start === ''
                ? null
                : resolveIncidentMoment(
                    time.start,
                    time.startInstant,
                    zone,
                    'start' in original ? original.start : null,
                  ),
            end:
              time.end === ''
                ? null
                : resolveIncidentMoment(
                    time.end,
                    time.endInstant,
                    zone,
                    'end' in original ? original.end : null,
                  ),
            description,
          }
        : time.kind === 'date'
          ? { kind: 'date', date: time.date, description }
          : { kind: 'unknown', description };
  return {
    ...document,
    animal: {
      ...document.animal,
      ...Object.fromEntries(textKeys.map((key) => [key, textValue(animal[key])])),
      sex: animal.sex || null,
      neutered: booleanValue(animal.neutered),
      microchipped: booleanValue(animal.microchipped),
      familiarWithArea: booleanValue(animal.familiarWithArea),
      outdoorAccess: animal.outdoorAccess || null,
      weightKilograms: numberValue(animal.weightKilograms),
      age:
        animal.age.value.trim() === ''
          ? null
          : {
              value: numberValue(animal.age.value) ?? NaN,
              unit: animal.age.unit,
              approximate: animal.age.approximate,
            },
    },
    case: {
      ...document.case,
      escape: {
        occurredAt,
        escapePointId: textValue(escape.escapePointId),
        description: textValue(escape.description),
        directionOfTravel: textValue(escape.directionOfTravel),
        familiarWithLocation: booleanValue(escape.familiarWithLocation),
      },
    },
  };
}
