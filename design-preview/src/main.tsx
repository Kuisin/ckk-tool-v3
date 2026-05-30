import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
  Button,
  TextInput,
  Select,
  NumberInput,
  Badge,
  Table,
} from '@mantine/core';
import { DatesProvider, DatePickerInput } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import 'dayjs/locale/ja';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import App from './App';

// Theme per _specs/design.md §1 — all interactive components default to size="sm"
const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  components: {
    Button:          Button.extend({ defaultProps: { size: 'sm' } }),
    TextInput:       TextInput.extend({ defaultProps: { size: 'sm' } }),
    Select:          Select.extend({ defaultProps: { size: 'sm' } }),
    NumberInput:     NumberInput.extend({ defaultProps: { size: 'sm' } }),
    DatePickerInput: DatePickerInput.extend({ defaultProps: { size: 'sm' } }),
    Badge:           Badge.extend({ defaultProps: { size: 'sm', radius: 'sm' } }),
    Table:           Table.extend({ defaultProps: { striped: true, highlightOnHover: true, withTableBorder: true, withColumnBorders: false } }),
  },
});

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'design-preview-color-scheme',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} colorSchemeManager={colorSchemeManager}>
      <DatesProvider settings={{ locale: 'ja' }}>
        <Notifications />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
