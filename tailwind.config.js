/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./dist/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B294A',
        muted: '#1B294A',
        brand: '#0052cc',
        canvas: '#f4f5f7',
      },
      boxShadow: {
        panel: '0 8px 24px rgba(9, 30, 66, 0.10)',
      },
    },
  },
  plugins: [],
};
