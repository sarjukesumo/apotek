/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50:"#eef9f3", 500:"#1aa97a", 600:"#138a63", 700:"#0d6b4d" },
        accent: { 500:"#0ea5e9" },
        warn: { 500:"#f59e0b" },
        danger: { 500:"#ef4444" },
        ink: { 900:"#0b1220", 700:"#1f2937", 500:"#6b7280" },
        surface: { 0:"#ffffff", 50:"#f8fafc", 100:"#f1f5f9" }
      },
      borderRadius: { xl:"14px", "2xl":"20px" },
      boxShadow: { card:"0 4px 24px rgba(2,8,23,.06)" },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] }
    }
  },
  plugins: []
};
