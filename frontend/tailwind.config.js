/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#07111f",
        aurora: "#59f6d2",
        signal: "#67a4ff",
        alarm: "#ff6b6b",
        glow: "#9c7dff",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(10, 17, 31, 0.45)",
      },
      backgroundImage: {
        grid:
          "linear-gradient(rgba(103,164,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(103,164,255,0.08) 1px, transparent 1px)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Manrope'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
