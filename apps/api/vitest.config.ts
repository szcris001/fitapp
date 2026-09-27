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
    // Rutas de los tests con contexto de tenant (RLS) como en producción
    setupFiles: ['src/test/tenant-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/__tests__/**'],
    },
  },
})
