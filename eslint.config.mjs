import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  { ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'] },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          checkDynamicDependenciesExceptions: [
            '@pawtrace/case-domain/history',
            '@pawtrace/case-domain/geometry',
          ],
          depConstraints: [
            {
              sourceTag: 'platform:web',
              onlyDependOnLibsWithTags: ['platform:web', 'platform:shared'],
              bannedExternalImports: ['@nestjs/*', 'node:*', 'sharp', 'express'],
            },
            {
              sourceTag: 'platform:api',
              onlyDependOnLibsWithTags: ['platform:api', 'platform:shared'],
              bannedExternalImports: ['@angular/*', 'leaflet', 'idb'],
            },
            {
              sourceTag: 'platform:shared',
              onlyDependOnLibsWithTags: ['platform:shared'],
              bannedExternalImports: [
                '@angular/*',
                '@nestjs/*',
                'node:*',
                'leaflet',
                'idb',
                'sharp',
                'express',
              ],
            },
            {
              sourceTag: 'type:map-engine',
              onlyDependOnLibsWithTags: ['platform:shared'],
            },
            {
              allSourceTags: ['platform:web', 'type:app'],
              bannedExternalImports: ['leaflet', 'leaflet/*'],
            },
            {
              sourceTag: 'type:browser-persistence',
              onlyDependOnLibsWithTags: ['platform:shared'],
            },
          ],
        },
      ],
    },
  },
];
