import type { ComponentProps } from 'react';

type LinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  href: string | { pathname: string; query?: Record<string, string> };
};

export default function Link({ href, children, ...props }: LinkProps) {
  const resolved = typeof href === 'string' ? href : href.pathname;
  return (
    <a href={resolved} {...props}>
      {children}
    </a>
  );
}
