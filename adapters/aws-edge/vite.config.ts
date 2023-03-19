import { azureSwaAdapter } from '@builder.io/qwik-city/adapters/azure-swa/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.aws-edge.tsx', '@qwik-city-plan']
      },
      outDir: 'aws'
    },
    plugins: [azureSwaAdapter()],
    ssr: {
      noExternal: /^((?!crypto).)*$/,
    },
  };
});
