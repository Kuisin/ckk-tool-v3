import type { ComponentProps } from 'react';

type ImageProps = ComponentProps<'img'> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  sizes?: string;
};

export default function Image({ fill: _fill, priority: _priority, quality: _quality, sizes: _sizes, ...props }: ImageProps) {
  return <img {...props} />;
}
