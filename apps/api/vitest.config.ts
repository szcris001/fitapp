import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Excluir explícitamente dist/ para evitar que vitest detecte los tests
    // compilados a CJS (que fallan porque vitest no puede ser importado con require())
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/__tests__/**'],
    },
  },
})
