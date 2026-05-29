import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import App from './App';

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'design-preview-color-scheme',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider colorSchemeManager={colorSchemeManager}>
      <Notifications />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
