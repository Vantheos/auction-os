// vercel.ts
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  functions: {
    'api/**/*.ts': {
      // runtime omitted — Node.js is the platform default. Setting
      // `runtime: 'nodejs'` here is rejected as an invalid custom runtime
      // ("Function Runtimes must have a valid version") because Vercel
      // parses the string as a package name expecting an @version suffix.
      memory: 1024,
      maxDuration: 60,
    },
  },
};
