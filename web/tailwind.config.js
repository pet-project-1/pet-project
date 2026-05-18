/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // PawFeeder palette — 퍼스널 컬러: 생연두(yeondu)
        sidebar: {
          DEFAULT: "#16261A",   // 딥 포레스트 그린 — 사이드바/카메라 배경
          border: "#2B4030",
          hover: "#22351F",
        },
        brand: {
          DEFAULT: "#9ED12A",   // 생연두 — 채움·강조 (어두운 배경 위 텍스트로도 OK)
          hover: "#8BBA24",     // 버튼 hover
          dark: "#5C8214",      // 딥 연두 — 밝은 배경 위 텍스트·아이콘·차트
          ink: "#1E3A0E",       // 거의 검정에 가까운 녹색 — 연두 버튼 위 글자
          muted: "#7E9466",     // 뮤트 그린그레이 — 사이드바 보조 텍스트
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
          good: "#9ED12A",
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
