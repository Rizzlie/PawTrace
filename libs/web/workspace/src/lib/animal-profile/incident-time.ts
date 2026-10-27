/** Native datetime-local values are wall times in the case zone, not device instants. */
function normalizedLocal(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const normalized = `${match[1]}T${match[2]}:${match[3] ?? '00'}.${(match[4] ?? '').padEnd(3, '0')}`;
  const milliseconds = Date.parse(`${normalized}Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === `${normalized}Z`
    ? normalized
    : null;
}

function localFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const fraction = new Date(instant).getUTCMilliseconds().toString().padStart(3, '0');
    return `${parts['year'].padStart(4, '0')}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}.${fraction}`;
  };
}

export function localIncidentMoment(timestamp: string | null, timeZone: string) {
  return timestamp === null
    ? { local: '', instant: '' }
    : {
        local: localFormatter(timeZone)(Date.parse(timestamp)).replace(/\.000$/, ''),
        instant: new Date(timestamp).toISOString(),
      };
}

/** Zero candidates: skipped time. Two candidates: repeated time, requiring a choice. */
export function incidentMomentChoices(value: string, timeZone: string) {
  const normalized = normalizedLocal(value);
  if (!normalized) return [];
  const wallTime = Date.parse(`${normalized}Z`);
  const localValue = localFormatter(timeZone);
  // Sample both sides of zone transitions; never let Date use the device zone.
  const offsets = new Set(
    Array.from({ length: 13 }, (_, index) => {
      const probe = wallTime + (index - 6) * 6 * 60 * 60 * 1000;
      return Date.parse(`${localValue(probe)}Z`) - probe;
    }),
  );
  return [...offsets]
    .map((offset) => wallTime - offset)
    .filter((instant) => localValue(instant) === normalized)
    .sort((a, b) => a - b)
    .map((instant) => ({
      value: new Date(instant).toISOString(),
      label:
        new Intl.DateTimeFormat('pl', {
          timeZone,
          timeZoneName: 'longOffset',
          hour: '2-digit',
        })
          .formatToParts(instant)
          .find((part) => part.type === 'timeZoneName')
          ?.value.replace('GMT', 'UTC') ?? timeZone,
    }));
}

export function resolveIncidentMoment(
  value: string,
  choice: string,
  timeZone: string,
  original?: string | null,
): string {
  const choices = incidentMomentChoices(value, timeZone);
  const selected =
    choices.length === 1 ? choices[0] : choices.find((item) => item.value === choice);
  if (!selected) return '';
  // Preserve an imported offset/precision verbatim when the instant was not changed.
  return original && Date.parse(original) === Date.parse(selected.value)
    ? original
    : selected.value;
}
