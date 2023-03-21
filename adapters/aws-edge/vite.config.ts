import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';
import { viteAdapter } from '@builder.io/qwik-city/adapters/shared/vite';
import { join, dirname } from 'path';
import fs from 'fs'

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry-aws-edge.tsx', '@qwik-city-plan']
      },
      outDir: '.aws-edge/function'
    },
    plugins: [awsEdgeAdapter()],
    ssr: {
      noExternal: /^((?!crypto).)*$/,
    },
  };
});


export function awsEdgeAdapter(opts: any /*AwsEdgeAdapterOptions */ = {}): any {
  return viteAdapter({
    name: 'aws-edge',
    origin: '',
    
    async generate({ clientOutDir, serverOutDir }) {
      // aws places all of the static files into the .aws-edge/static directory
      // move from the dist directory to aws's output static directory
      let awsStaticDir = join(serverOutDir, '..', 'static');

      // ensure we remove any existing static dir
      await fs.promises.rm(awsStaticDir, { recursive: true, force: true });

      // ensure the containing directory exists we're moving the static dir to exists
      await fs.promises.mkdir(dirname(awsStaticDir), { recursive: true });

      // move the dist directory to the aws output static directory location
      await fs.promises.rename(clientOutDir, awsStaticDir);
    },
  });
}
