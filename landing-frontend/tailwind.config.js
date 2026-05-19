const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, "index.html"), path.join(__dirname, "src/**/*.{js,jsx,ts,tsx}")],
  theme: {
    extend: {
      colors: {
        ink: "#0c1224",
        mist: "#eef3fb",
        teal: "#14b8a6",
        indigo: "#2d3a8c",
        glow: "#5eead4"
      },
      fontFamily: {
        display: ['"DM Sans"', "system-ui", "sans-serif"],
        body: ['"Source Sans 3"', "system-ui", "sans-serif"]
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        "float-delayed": "float 8s ease-in-out 2s infinite",
        shimmer: "shimmer 3s linear infinite",
        "wave-bar": "waveBar 1.2s ease-in-out infinite",
        "pulse-ring": "pulseRing 2.4s ease-out infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-18px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" }
        },
        waveBar: {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" }
        },
        pulseRing: {
          "0%": { transform: "scale(0.85)", opacity: "0.6" },
          "100%": { transform: "scale(1.35)", opacity: "0" }
        }
      }
    }
  },
  plugins: []
};
