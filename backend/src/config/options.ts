/**
 * Default option lists served by GET /api/options/:key and cached on the
 * mobile. Admin can override any key via PUT /api/options/:key (stored in
 * AppOption). Overrides merge over defaults; scalar keys are fully replaced.
 */
export interface OptionsRegistry {
  [key: string]: {
    kind: 'list' | 'value';
    default: unknown;
  };
}

export const optionDefaults: OptionsRegistry = {
  'patrol-types': { kind: 'list', default: ['WALK', 'BICYCLE', 'VEHICLE', 'STATIONARY'] },
  'human-impact-types': {
    kind: 'list',
    default: ['LOGGING', 'POACHING', 'FIRE', 'ENROACHMENT', 'GRAZING', 'OTHER'],
  },
  'animal-mortality-causes': {
    kind: 'list',
    default: ['POACHING', 'POISONING', 'ROAD_KILL', 'DISEASE', 'ACCIDENT', 'UNKNOWN'],
  },
  'sighting-types': {
    kind: 'list',
    default: ['TRACKS', 'DROPPINGS', 'GRAZING_MARKS', 'LIVE_SIGHTING', 'CALLS', 'OTHER'],
  },
  'water-source-answers': {
    kind: 'list',
    default: ['FUNCTIONAL', 'DRY', 'DAMAGED', 'SILTED', 'NOT_FOUND'],
  },
  'action-taken': {
    kind: 'list',
    default: ['WARNED', 'DETAINED', 'CONFISCATED', 'REPORTED', 'FIRED', 'RESOLVED'],
  },
  'sync-interval': { kind: 'value', default: 600 },
  languages: { kind: 'list', default: ['en', 'hi', 'te', 'ta', 'kn'] },
};
