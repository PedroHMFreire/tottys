
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: { '2xl': '1.25rem' },
      fontFamily: {
        rubik:   ['Rubik', 'sans-serif'],
        nunito:  ['"Nunito Sans"', 'sans-serif'],
        syne:    ['Syne', 'sans-serif'],
        manrope: ['Manrope', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
