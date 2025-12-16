import type { Config } from 'tailwindcss'

export default <Config>{
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5', // Indigo 600
          hover: '#4338ca',   // Indigo 700
        },
        secondary: {
          DEFAULT: '#14B8A6', // Teal 500
          hover: '#0d9488',   // Teal 600
        },
        accent: '#F59E0B', // Amber 500
        surface: '#F9FAFB', // Gray 50
      },
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
        serif: ['Lora', 'serif'],
      }
    }
  }
}
