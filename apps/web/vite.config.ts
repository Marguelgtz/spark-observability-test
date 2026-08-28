import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __SPARK_FIXTURE_API__: JSON.stringify(mode !== 'production')
  },
  server: {
    host: '127.0.0.1'
  }
}));
