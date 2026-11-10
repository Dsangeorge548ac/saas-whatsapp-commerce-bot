/**
 * Campos de formulario minimalistas (ref. login-example.png: label pequeño + línea inferior).
 *
 * - Field: label visible, el control, ayuda opcional y el error en rojo debajo.
 *   Conecta label/error con id, aria-invalid y aria-describedby (accesibilidad).
 * - TextInput / SelectInput: controles con borde inferior; en error, la línea se pone roja.
 * Altura táctil: h-12 en móvil, h-11 desde sm.
 */
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const controlClasses =
  "h-12 w-full border-0 border-b border-border bg-transparent px-0 text-sm text-fg placeholder:text-fg-muted/70 " +
  "outline-none transition-colors focus:border-black sm:h-11 aria-invalid:border-danger disabled:opacity-60";

type FieldProps = {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (controlProps: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
};

export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg">
        {label}
        {required ? <span aria-hidden className="text-danger"> *</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={messageId} className="mt-1.5 text-xs text-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function TextInput(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlClasses, className)} {...props} />;
});

export const SelectInput = forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function SelectInput(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlClasses, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
});
