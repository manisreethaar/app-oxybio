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
        navy: {
          DEFAULT: '#09090B', // Zinc 950 (Ultra Sleek Dark)
          hover: '#27272A',   // Zinc 800
          light: '#52525B',   // Zinc 600
        },
        accent: {
          DEFAULT: '#0EA5E9', // Sky Blue / Tech Cyan
          hover: '#0284C7',
          light: '#E0F2FE',
        }
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.05)',
        'glass-hover': '0 10px 40px rgba(0, 0, 0, 0.08)',
        'soft': '0 2px 10px rgba(0,0,0,0.02), 0 10px 25px rgba(0,0,0,0.04)',
      },
      backgroundImage: {
        'mesh-light': 'radial-gradient(at 0% 0%, hsla(210,100%,98%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(190,100%,96%,1) 0, transparent 50%), radial-gradient(at 100% 100%, hsla(210,100%,98%,1) 0, transparent 50%)',
      }
    },
  },
  plugins: [],
};
