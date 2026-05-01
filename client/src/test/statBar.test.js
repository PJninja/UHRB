import { describe, test, expect } from 'vitest';
import StatBar from '../lib/components/StatBar.svelte';

describe('StatBar Component', () => {
  test('exports a valid Svelte component', () => {
    expect(StatBar).toBeDefined();
    expect(typeof StatBar).toBe('function');
  });

  test('component module is importable', () => {
    // In Svelte 5, components are functions that can be used via mount()
    // We just verify the component module loads without errors
    expect(StatBar.name).toBe('StatBar');
  });
});
