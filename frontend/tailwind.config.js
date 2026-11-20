/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#ff1b1b',
          'red-hover': '#e01616',
          gold: '#d4af37',
          yellow: '#f0ac00',
          green: '#13a45a',
          'green-bright': '#25cf73',
          dark: '#090909',
          'dark-card': '#101011',
          'dark-surface': '#151515',
          'dark-border': '#292929',
          paper: '#f4f2ec',
          'paper-dark': '#eceae5',
          line: '#d8d5ce',
          muted: '#747474',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'brand': '18px',
      }
    },
  },
  plugins: [],
}
