/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        canvas: '#080a0f',
        sidebar: '#0c0e16',
        panel: '#111520',
        item: '#161b2e',
        border: '#1e2a3d',
        accent: '#22d3ee',
        'accent-dim': '#0891b2',
      },
    },
  },
  plugins: [],
};
