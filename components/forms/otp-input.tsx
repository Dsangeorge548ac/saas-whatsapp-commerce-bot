"use client";
/**
 * Entrada de código de 6 dígitos (OTP de email, SMS o app de autenticación).
 *
 * - 6 casillas; al escribir un dígito pasa a la siguiente y Backspace vuelve atrás.
 * - Pegar el código completo lo reparte en las casillas.
 * - inputMode="numeric" abre el teclado numérico en el móvil y autoComplete="one-time-code"
 *   permite que iOS/Android sugieran el código del SMS.
 * - Solo acepta dígitos; el valor se maneja como un string controlado por el padre.
 */
import { useRef } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
  autoFocus?: boolean;
};

export function OtpInput({ value, onChange, invalid, disabled, label, autoFocus }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: LENGTH }, (_, index) => value[index] ?? "");

  function focusBox(index: number) {
    inputsRef.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();
  }

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, LENGTH));
  }

  function handleChange(index: number, rawValue: string) {
    const onlyDigits = rawValue.replace(/\D/g, "");
    if (!onlyDigits) return setDigit(index, "");

    // Si llegan varios dígitos (pegado o autocompletado), se reparten desde esta casilla.
    if (onlyDigits.length > 1) {
      const next = digits.slice();
      onlyDigits.split("").forEach((digit, offset) => {
        if (index + offset < LENGTH) next[index + offset] = digit;
      });
      onChange(next.join(""));
      focusBox(index + onlyDigits.length);
      return;
    }

    setDigit(index, onlyDigits);
    focusBox(index + 1);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index]) focusBox(index - 1);
    if (event.key === "ArrowLeft") focusBox(index - 1);
    if (event.key === "ArrowRight") focusBox(index + 1);
  }

  return (
    <div role="group" aria-label={label} className="flex gap-2 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={LENGTH}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-invalid={invalid}
          className={cn(
            "size-12 rounded-xl border border-border bg-surface text-center text-lg font-medium text-fg outline-none transition-colors",
            "focus:border-black focus:ring-2 focus:ring-accent disabled:opacity-60 sm:size-13",
            invalid && "border-danger",
          )}
        />
      ))}
    </div>
  );
}
