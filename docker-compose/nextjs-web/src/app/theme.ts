/**
 * theme.ts — Mantine theme configuration (_specs/design.md §2).
 *
 * primaryColor: blue / defaultRadius: sm / global size="sm" defaults.
 * Imported only from the client-side <Providers> — keep non-serializable
 * values (component extensions) out of Server Component props.
 */

import {
  Badge,
  Button,
  createTheme,
  NumberInput,
  Select,
  Table,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  components: {
    Button: Button.extend({ defaultProps: { size: "sm" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "sm" } }),
    Select: Select.extend({ defaultProps: { size: "sm" } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: "sm" } }),
    DatePickerInput: DatePickerInput.extend({ defaultProps: { size: "sm" } }),
    Badge: Badge.extend({ defaultProps: { size: "sm", radius: "sm" } }),
    Table: Table.extend({
      defaultProps: {
        striped: true,
        highlightOnHover: true,
        withTableBorder: true,
        withColumnBorders: false,
      },
    }),
  },
});
