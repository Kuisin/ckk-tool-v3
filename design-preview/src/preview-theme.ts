import {
  createTheme,
  localStorageColorSchemeManager,
  Button,
  TextInput,
  Select,
  NumberInput,
  Badge,
  Table,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';

/** Theme per _specs/design.md §1 — all interactive components default to size="sm" */
export const previewTheme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  // Soften headings: Mantine defaults Title to 700. Pin to 600, which (per the
  // one-step-lighter mapping in main.tsx) renders Regular, keeping titles thin.
  headings: { fontWeight: '600' },
  components: {
    Button: Button.extend({ defaultProps: { size: 'sm' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'sm' } }),
    Select: Select.extend({ defaultProps: { size: 'sm' } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: 'sm' } }),
    DatePickerInput: DatePickerInput.extend({ defaultProps: { size: 'sm' } }),
    Badge: Badge.extend({ defaultProps: { size: 'sm', radius: 'sm' } }),
    Table: Table.extend({
      defaultProps: {
        striped: true,
        highlightOnHover: true,
        withTableBorder: true,
        withColumnBorders: false,
        verticalSpacing: 'xs',
      },
    }),
  },
});

export const shellColorSchemeManager = localStorageColorSchemeManager({
  key: 'design-preview-color-scheme',
});
