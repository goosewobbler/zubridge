/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'light-bg': '#f3f0ff',
        'light-text': '#1e293b',
        'dark-bg': '#0f172a',
        'dark-text': '#f1f5f9',
        'status-ready': '#10b981',
        'status-error': '#ef4444',
      },
    },
  },
  plugins: [],
};
