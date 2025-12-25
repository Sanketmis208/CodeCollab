/**** Tailwind config for JS client ****/
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b1220',
        card: '#0f172a',
        border: '#1f2a44',
        primary: {
          DEFAULT: '#6366f1'
        },
        accent: '#14b8a6',
        muted: '#94a3b8'
      }
    }
  },
  plugins: []
};
