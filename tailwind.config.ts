import type { Config } from 'tailwindcss';

const oklchToken = (token: string) => `oklch(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: oklchToken('--border'),
        input: oklchToken('--input'),
        ring: oklchToken('--ring'),
        background: oklchToken('--background'),
        foreground: oklchToken('--foreground'),
        primary: {
          DEFAULT: oklchToken('--primary'),
          foreground: oklchToken('--primary-foreground'),
        },
        secondary: {
          DEFAULT: oklchToken('--secondary'),
          foreground: oklchToken('--secondary-foreground'),
        },
        destructive: {
          DEFAULT: oklchToken('--destructive'),
          foreground: oklchToken('--destructive-foreground'),
        },
        muted: {
          DEFAULT: oklchToken('--muted'),
          foreground: oklchToken('--muted-foreground'),
        },
        accent: {
          DEFAULT: oklchToken('--accent'),
          foreground: oklchToken('--accent-foreground'),
        },
        popover: {
          DEFAULT: oklchToken('--popover'),
          foreground: oklchToken('--popover-foreground'),
        },
        card: {
          DEFAULT: oklchToken('--card'),
          foreground: oklchToken('--card-foreground'),
        },
        sidebar: {
          DEFAULT: oklchToken('--sidebar'),
          foreground: oklchToken('--sidebar-foreground'),
          primary: oklchToken('--sidebar-primary'),
          'primary-foreground': oklchToken('--sidebar-primary-foreground'),
          accent: oklchToken('--sidebar-accent'),
          'accent-foreground': oklchToken('--sidebar-accent-foreground'),
          border: oklchToken('--sidebar-border'),
          ring: oklchToken('--sidebar-ring'),
        },
        canvas: '#020617',
        panel: '#0f172a',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        xl: 'var(--radius-xl)',
      },
    },
  },
  plugins: [],
};

export default config;