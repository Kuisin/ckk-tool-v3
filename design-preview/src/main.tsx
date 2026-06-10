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
// Use STATIC faces (not the variable TTF, whose wght axis defaults to 100 and renders
// heavy/uneven in Chromium). Three faces keep weights legible:
//   400 → Regular   (body)
//   500–600 → Medium  (field values, titles, card headings — the bulk of "semibold" UI;
//                      mapped to Medium so they read thinner instead of slamming to Bold)
//   700 → Bold       (reserved for true emphasis: totals, strong labels)
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
    src: url('${_fontBase}/NotoSansJP-Medium.ttf') format('truetype');
    font-weight: 500 600;
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
