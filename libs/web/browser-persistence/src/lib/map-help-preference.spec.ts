import { hasSeenMapHelp, rememberMapHelp } from './map-help-preference';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it('remembers that the map help was seen', () => {
  expect(hasSeenMapHelp()).toBe(false);
  rememberMapHelp();
  expect(hasSeenMapHelp()).toBe(true);
});

it('keeps help usable when browser storage is unavailable', () => {
  const blocked = () => {
    throw new Error('Storage blocked');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
  expect(() => rememberMapHelp()).not.toThrow();
  expect(hasSeenMapHelp()).toBe(false);
});
