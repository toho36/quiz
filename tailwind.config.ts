import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: '#1e293b',
        canvas: '#020617',
        panel: '#0f172a',
        accent: '#38bdf8',
      },
    },
  },
  plugins: [],
};

export default config;