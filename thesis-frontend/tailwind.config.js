/** @type {import('tailwindcss').Config} */
export default {
  // ── Content paths ────────────────────────────────────────────────────────────
  // Tell Tailwind which files to scan for class names so unused styles are purged.
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],

  // ── Dark mode ─────────────────────────────────────────────────────────────────
  // "class" strategy: dark mode is activated by adding the "dark" class to the
  // root element (see App.jsx) rather than relying on the OS preference.
  darkMode: 'class',

  theme: {
    extend: {
      // ── Custom semantic colors ─────────────────────────────────────────────────
      // These map to Tailwind utility classes such as bg-primary, text-danger, etc.
      colors: {
        primary: '#3b82f6',  // blue-500
        danger:  '#ef4444',  // red-500
        warning: '#eab308',  // yellow-500
        success: '#22c55e',  // green-500
        info:    '#06b6d4',  // cyan-500
      },
    },
  },

  plugins: [],
}