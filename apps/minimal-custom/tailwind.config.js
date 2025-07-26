/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './src/renderer/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2196f3',
          hover: '#0b7dda',
          active: '#0a6bc2',
        },
        secondary: {
          DEFAULT: '#8b5cf6',
          hover: '#7c3aed',
          active: '#6d28d9',
        },
        danger: {
          DEFAULT: '#ef4444',
          hover: '#dc2626',
          active: '#b91c1c',
        },
        warning: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
          active: '#b45309',
        },
        success: {
          DEFAULT: '#10b981',
          hover: '#059669',
          active: '#047857',
        },
        dark: {
          bg: '#0f172a',
          text: '#f1f5f9',
          accent: '#a78bfa',
        },
        light: {
          bg: '#f3f0ff',
          text: '#334155',
          accent: '#6d28d9',
        },
      },
      transitionProperty: {
        button: 'background-color, transform',
      },
      transitionDuration: {
        bg: '300ms',
        transform: '100ms',
      },
      minWidth: {
        button: '110px',
      },
      height: {
        button: '38px',
      },
    },
  },
  plugins: [],
};
