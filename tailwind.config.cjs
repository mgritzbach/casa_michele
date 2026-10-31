/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        amber: { 50: '#faf5eb', 100: '#f0e3ca', 200: '#e3cca4', 300: '#d6ba86', 400: '#d1b175', 500: '#c6a266', 600: '#a3844d', 700: '#82673d', 800: '#5b4930', 900: '#352b20', 950: '#211c15' },
        zinc: { 50: '#f6f5f2', 100: '#efeeeb', 200: '#d8d7d3', 300: '#bdbcb8', 400: '#a4a39f', 500: '#85847f', 600: '#64635e', 700: '#464540', 800: '#30302d', 900: '#1c1c1a', 950: '#111110' },
      },
    },
  },
  plugins: [],
};
