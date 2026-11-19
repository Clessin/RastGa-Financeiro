import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bodyBg: '#F8F9FA',
        actionBtn: '#F0F0F2',
        sectionTitle: '#1A1A1A',
        mutedLabel: '#A0A0A0',
        tabInactive: '#7A7A7A',
      },
    },
  },
  plugins: [],
};

export default config;
