import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library does not auto-register cleanup without Vitest globals.
afterEach(() => {
  cleanup();
});
