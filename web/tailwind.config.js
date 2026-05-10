/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // PawFeeder palette (from mockups)
        sidebar: {
          DEFAULT: "#1A2233",
          border: "#2A3A50",
          hover: "#243448",
        },
        brand: {
          DEFAULT: "#1A82E2",
          hover: "#1568B8",   // button hover (원본 .btn-save:hover)
          dark: "#0D5DB8",    // gradient endpoint
          muted: "#5B7D95",
        },
        ink: {
          DEFAULT: "#1A2233",
          body: "#294661",
          mute: "#5B7D95",
          faint: "#8CA0B3",
          line: "#E8ECF0",        // 카드/표 보더
          strong: "#D8DEE6",      // 입력/탭 보더 (조금 진함)
          softline: "#F0F2F5",
        },
        canvas: "#F6F6F8",        // 페이지 배경
        surface: "#F6F8FA",       // 테이블 hover · 알림 · feed-log 배경
        avatar: "#EDF1F5",        // 아바타 배경
        accent: {
          warn: "#F4A261",
          danger: "#E76F51",
          good: "#1A82E2",
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans KR"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
