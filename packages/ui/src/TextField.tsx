import type { ReactNode } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'className' | 'children'> {
  readonly label: string;
  readonly description?: string;
  /** Field-level error text; marks the field invalid and keeps the entered value. */
  readonly errorMessage?: ReactNode;
}

export function TextField({ label, description, errorMessage, ...props }: TextFieldProps) {
  const invalid = props.isInvalid ?? errorMessage !== undefined;
  return (
    <AriaTextField {...props} isInvalid={invalid}>
      <Label>{label}</Label>
      <Input className="cc-input" />
      {description !== undefined && (
        <Text slot="description" className="cc-field-description">
          {description}
        </Text>
      )}
      <FieldError className="cc-field-error">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
