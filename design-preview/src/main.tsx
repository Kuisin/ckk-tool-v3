import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import 'dayjs/locale/ja';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import { previewTheme, shellColorSchemeManager } from './preview-theme';
import App from './App';

// Inject Noto Sans JP using a base-URL-aware path so it works on GitHub Pages.
// Use the STATIC Regular (400) + Bold (700) faces, not the variable TTF: the variable
// font's wght axis defaults to 100 (usWeightClass 100), which Chromium (Arc/Chrome) maps
// inconsistently and renders heavy/uneven. Two static faces give correct normal vs. bold.
// font-smoothing keeps text crisp on macOS.
const _fontBase = `${import.meta.env.BASE_URL}design-assets/fonts`;
const _fontStyle = document.createElement('style');
_fontStyle.textContent = `
  @font-face {
    font-family: 'Noto Sans JP';
    src: url('${_fontBase}/NotoSansJP-Regular.ttf') format('truetype');
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: 'Noto Sans JP';
    src: url('${_fontBase}/NotoSansJP-Bold.ttf') format('truetype');
    font-weight: 700;
    font-display: swap;
  }
  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;
document.head.appendChild(_fontStyle);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={previewTheme} colorSchemeManager={shellColorSchemeManager}>
      <DatesProvider settings={{ locale: 'ja' }}>
        <Notifications />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
