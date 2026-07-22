import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CurrencyInput from './CurrencyInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <CurrencyInput value={value} onChange={setValue} />;
}

describe('CurrencyInput', () => {
  it('starts empty when value is an empty string', () => {
    render(<Harness />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('shows a plain integer with no thousand separator or decimals yet', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '500' } });

    expect(input).toHaveValue('500');
  });

  it('formats thousands live while typing a decimal comma value', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1500,5' } });

    expect(input).toHaveValue('1.500,5');
  });

  it('keeps two decimal digits after the comma', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1500,50' } });

    expect(input).toHaveValue('1.500,50');
  });

  it('truncates extra decimal digits to two', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '10,999' } });

    expect(input).toHaveValue('10,99');
  });

  it('emits the canonical dot-decimal value via onChange', () => {
    let latest = '';
    function Spy() {
      const [value, setValue] = useState('');
      return (
        <CurrencyInput
          value={value}
          onChange={(v) => {
            latest = v;
            setValue(v);
          }}
        />
      );
    }
    render(<Spy />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1500,5' } });

    expect(latest).toBe('1500.5');
  });

  it('displays an externally-set canonical value formatted for the user', () => {
    render(<Harness initial="2500.00" />);
    expect(screen.getByRole('textbox')).toHaveValue('2.500,00');
  });

  it('clears back to empty when the field is emptied', () => {
    render(<Harness initial="2500.00" />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveValue('');
  });

  it('ignores non-numeric characters typed into the field', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'R$ 12a3,x5' } });

    expect(input).toHaveValue('123,5');
  });
});
