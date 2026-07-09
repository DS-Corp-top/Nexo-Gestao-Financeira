import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandLogo from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the current wordmark asset with custom alt text', () => {
    render(<BrandLogo alt="Marca Nexo" />);

    const image = screen.getByAltText('Marca Nexo');

    expect(image).toHaveAttribute('src', '/logo-text.png');
  });

  it('applies the invert filter when requested', () => {
    render(<BrandLogo invert />);

    const image = screen.getByAltText(/Nexo/i);

    expect(image).toHaveStyle({ filter: 'brightness(0) invert(1)' });
  });
});
