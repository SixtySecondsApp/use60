import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['supabase/functions/**/test.ts', 'supabase/functions/**/*.test.ts'],
    setupFiles: ['./tests/edge-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Map ALL Deno-style esm.sh imports to node_modules equivalents
      'https://esm.sh/@supabase/supabase-js@2.43.4': '@supabase/supabase-js',
      'https://esm.sh/@supabase/supabase-js@2': '@supabase/supabase-js',
      'https://deno.land/std@0.168.0/http/server.ts': path.resolve(__dirname, 'tests/__mocks__/deno-http-server.ts'),
    }
  }
})
