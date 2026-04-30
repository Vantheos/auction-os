// vercel.ts
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  functions: {
    'api/**/*.ts': {
      runtime: 'nodejs',
      memory: 1024,
      maxDuration: 60,
    },
  },
};
