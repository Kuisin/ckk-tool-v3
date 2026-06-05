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

// Inject Noto Sans JP using a base-URL-aware path so it works on GitHub Pages
const _fontStyle = document.createElement('style');
_fontStyle.textContent = `@font-face { font-family: 'Noto Sans JP'; src: url('${import.meta.env.BASE_URL}design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }`;
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
