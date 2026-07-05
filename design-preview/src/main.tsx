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
import { injectFonts } from './inject-fonts';
import App from './App';

injectFonts();

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
