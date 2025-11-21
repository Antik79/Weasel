/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2fbff",
          100: "#e0f4ff",
          200: "#bfe6ff",
          300: "#8dd0ff",
          400: "#49afff",
          500: "#1c90ff",
          600: "#0d6de6",
          700: "#0b57b8",
          800: "#0f4990",
          900: "#123f74"
        }
      }
    }
  },
  plugins: []
};

