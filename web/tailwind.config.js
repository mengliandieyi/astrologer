/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        jade: {
          DEFAULT: "#1f9d8a",
          700: "#0f766e",
        },
        gold: {
          DEFAULT: "#c9a227",
          700: "#a57b1c",
        },
      },
      boxShadow: {
        soft: "0 18px 45px rgba(9, 14, 38, .18)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
}

