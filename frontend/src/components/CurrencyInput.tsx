import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  required?: boolean;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

function toDisplay(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [intPartRaw, decPart] = raw.replace('-', '').split('.');
  const intPart = (intPartRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const display = decPart !== undefined ? `${intPart},${decPart}` : intPart;
  return negative ? `-${display}` : display;
}

function toCanonical(display: string): string {
  const negative = display.trim().startsWith('-');
  const digitsAndComma = display.replace(/[^\d,]/g, '');
  const firstComma = digitsAndComma.indexOf(',');
  let intPart: string;
  let decPart: string | undefined;
  if (firstComma === -1) {
    intPart = digitsAndComma;
  } else {
    intPart = digitsAndComma.slice(0, firstComma);
    decPart = digitsAndComma.slice(firstComma + 1).replace(/,/g, '').slice(0, 2);
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const canonical = decPart !== undefined ? `${intPart || '0'}.${decPart}` : intPart;
  return negative && canonical ? `-${canonical}` : canonical;
}

function countDigitsAndCommaBefore(value: string, caret: number): number {
  let count = 0;
  for (let i = 0; i < caret && i < value.length; i += 1) {
    if (/[\d,]/.test(value[i])) count += 1;
  }
  return count;
}

function caretPositionForCount(value: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/[\d,]/.test(value[i])) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return value.length;
}

export default function CurrencyInput({
  value,
  onChange,
  className,
  style,
  required,
  placeholder,
  id,
  disabled,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [display, setDisplay] = useState(() => toDisplay(value));

  useEffect(() => {
    if (toCanonical(display) !== value) {
      setDisplay(toDisplay(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const oldDisplay = display;
    const oldCaret = input.selectionStart ?? oldDisplay.length;
    const digitsBefore = countDigitsAndCommaBefore(input.value, oldCaret);

    const canonical = toCanonical(input.value);
    const nextDisplay = toDisplay(canonical);
    setDisplay(nextDisplay);
    onChange(canonical);

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const nextCaret = caretPositionForCount(nextDisplay, digitsBefore);
      inputRef.current.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <input
      ref={inputRef}
      id={id}
      className={className}
      style={style}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
    />
  );
}
