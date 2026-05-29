import React from 'react';
import { Center, Stack, Text, Button } from '@mantine/core';

interface Props {
  children: React.ReactNode;
  onReset: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Center h={300}>
          <Stack align="center" gap="sm">
            <Text c="red" fw={500}>Render error</Text>
            <Text size="sm" c="dimmed" style={{ maxWidth: 480, wordBreak: 'break-all' }}>
              {this.state.error?.message}
            </Text>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset();
              }}
            >
              Retry
            </Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
