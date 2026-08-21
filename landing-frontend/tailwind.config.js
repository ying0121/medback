const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "index.html"), path.join(__dirname, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        ink: "#0f1b2d",
        navy: "#1b3a5c",
        mist: "#e8eef5",
        line: "#d5dee8",
        surface: "#ffffff",
        sage: "#3d6b7a",
        soft: "#f7f9fc"
      },
      fontFamily: {
        display: ['"Outfit"', "system-ui", "sans-serif"],
        body: ['"Source Sans 3"', "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 50px -28px rgba(15, 27, 45, 0.35)"
      },
      animation: {
        float: "float 9s ease-in-out infinite",
        "float-delayed": "float 9s ease-in-out 1.8s infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" }
        }
      }
    }
  },
  plugins: []
};
