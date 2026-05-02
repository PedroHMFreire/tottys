
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:    'var(--color-primary)',     // #1E40AF → #3B82F6
        // Semânticos — mudam automaticamente com CSS vars em dark mode
        navy:       'var(--color-navy)',        // #1E1B4B → #E2E8F0
        'navy-mid': 'var(--color-navy-mid)',    // #334155 → #CBD5E1
        'navy-ghost': 'var(--color-navy-ghost)',// #EFF6FF → rgba blue dark tint
        azure:      'var(--color-azure)',       // #1E40AF → #60A5FA (text only)
        'azure-dark':'var(--color-azure-dark)', // #1E3A8A → #3B82F6
        surface:    'var(--color-surface)',     // #FFFFFF → #1E293B
        'surface-2':'var(--color-surface-2)',   // #F8FAFC → #0F172A
        border:     'var(--color-border)',      // #E2E8F0 → #334155
      },
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
