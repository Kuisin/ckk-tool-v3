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
// NOTE: this is a variable font — it MUST be declared with format('truetype-variations'),
// otherwise Chromium (Arc/Chrome) ignores the `wght` axis and renders every glyph at the
// font's default heavy master, making all text look bold. font-smoothing keeps macOS crisp.
const _fontStyle = document.createElement('style');
_fontStyle.textContent = `
  @font-face {
    font-family: 'Noto Sans JP';
    src: url('${import.meta.env.BASE_URL}design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype-variations');
    font-weight: 100 900;
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
