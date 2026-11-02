import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  readonly variant?: 'primary' | 'secondary' | 'danger';
}

/** Button with a 44 x 44 CSS pixel minimum target and a visible focus indicator. */
export function Button({ variant = 'primary', ...props }: ButtonProps) {
  return <AriaButton {...props} className="cc-button" data-variant={variant} />;
}
