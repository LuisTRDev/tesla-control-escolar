/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      },
      colors: {
        // Identidad del colegio (mismos tonos del escudo / web pública),
        // disponible en toda la app como bg-brand-navy, text-brand-gold, etc.

      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        toastIn: { '0%': { opacity: '0', transform: 'translateY(8px) scale(.96)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        toastOut: { '0%': { opacity: '1', transform: 'translateY(0) scale(1)' }, '100%': { opacity: '0', transform: 'translateY(8px) scale(.96)' } },
        popIn: { '0%': { opacity: '0', transform: 'scale(.85)' }, '60%': { opacity: '1', transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)' } },
        confettiFall: { '0%': { transform: 'translateY(-10px) rotate(0deg)', opacity: '1' }, '100%': { transform: 'translateY(120px) rotate(280deg)', opacity: '0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(240,180,41,.55)' }, '100%': { boxShadow: '0 0 0 10px rgba(240,180,41,0)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        toastIn: 'toastIn .25s cubic-bezier(.2,.8,.25,1) forwards',
        toastOut: 'toastOut .2s ease forwards',
        popIn: 'popIn .35s cubic-bezier(.2,.8,.25,1) forwards',
        confettiFall: 'confettiFall 900ms ease-out forwards',
        pulseRing: 'pulseRing 1.4s ease-out infinite',
      },
    }
  },
  plugins: []
}
