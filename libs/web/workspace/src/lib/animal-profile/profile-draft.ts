import type { AnimalProfile, CaseDocument } from '@pawtrace/case-domain';
import {
  createEventTimeDraft,
  applyEventTimeDraft,
  type EventTimeDraft,
} from '../event-time-draft';

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
    time: EventTimeDraft;
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
      time: createEventTimeDraft(time, zone),
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
  const occurredAt = applyEventTimeDraft(
    escape.time,
    document.case.timeZone,
    document.case.escape.occurredAt,
  );
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
