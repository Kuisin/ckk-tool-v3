import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/ja';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './index.css';
import { previewTheme } from './preview-theme';
import { FrameApp, parseFrameSearchParams } from './frame-app';

const frameParams = parseFrameSearchParams(window.location.search);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider
      theme={previewTheme}
      forceColorScheme={frameParams.scheme}
      getRootElement={() => document.documentElement}
    >
      <DatesProvider settings={{ locale: 'ja' }}>
        <FrameApp
          design={frameParams.design}
          viewport={frameParams.viewport}
          mode={frameParams.mode}
          remountKey={frameParams.remountKey}
        />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
