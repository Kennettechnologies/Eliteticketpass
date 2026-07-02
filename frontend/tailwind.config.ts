import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "#0a0a0a",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "#ffffff",
        },
        success: "#10b981",
        error: "#ef4444",
        warning: "#f59e0b",
        muted: "var(--muted)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Syne", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "16px",
        xl: "20px",
        full: "9999px",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
        "hero-gradient": "linear-gradient(to bottom, rgba(245,158,11,0.15) 0%, transparent 60%)",
        "card-gradient": "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.9) 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
