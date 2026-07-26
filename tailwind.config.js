/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Brand Slate (formerly named 'navy' but incorrectly mapped to Violet)
        navy: {
          DEFAULT: '#1e293b', // Slate 800
          hover:   '#334155', // Slate 700
          light:   '#f1f5f9', // Slate 100
        },
        accent: {
          DEFAULT: '#1e293b', // Slate 800
          hover:   '#334155', // Slate 700
          light:   '#f1f5f9', // Slate 100
        },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 24px rgba(0,0,0,0.08)',
        'glass':      '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'soft':       '0 2px 8px rgba(0,0,0,0.04)',
        'lifted':     '0 8px 32px rgba(0,0,0,0.10)',
        'glow':       '0 0 20px rgba(30, 41, 59, 0.25)', // Slate glow
        'glow-sm':    '0 0 10px rgba(30, 41, 59, 0.15)',
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #334155 0%, #1e293b 100%)', // Slate 700 to 800
        'gradient-sidebar': 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)', // Light slate/ice
        'gradient-page':    'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', // Pure white to slate-50
      },
      animation: {
        'fade-in':    'fade-in 280ms cubic-bezier(0.16,1,0.3,1) both',
        'page-enter': 'page-enter 380ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':   'slide-up 300ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-bottom': 'slide-in-bottom 350ms cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        'fade-in':    { from: { opacity: '0' }, to: { opacity: '1' } },
        'page-enter': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up':   { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-bottom': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
