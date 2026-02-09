/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      backgroundImage: {
        'gradient-card': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-subtle': 'linear-gradient(180deg, #e0e7ff 0%, #f5f3ff 50%, #ede9fe 100%)',
      },
    },
  },
  plugins: [],
};
