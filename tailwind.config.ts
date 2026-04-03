import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        bg: '#080808',
        sidebar: '#000000',
        card: '#0d0d0d',
        border: '#1a1a1a',
        'border-modal': '#2a2a2a',
        muted: '#555',
        dim: '#333',
      },
      fontSize: {
        '2xs': '9px',
        xs: '11px',
        sm: '12px',
        base: '13px',
      },
    },
  },
  plugins: [],
};

export default config;
