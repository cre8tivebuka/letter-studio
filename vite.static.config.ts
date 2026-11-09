import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig,loadEnv} from 'vite';

const root=fileURLToPath(new URL('.',import.meta.url));

export default defineConfig(({mode})=>{
 const env=loadEnv(mode,root,'VITE_');
 const configuredBase=process.env.VITE_BASE_PATH||env.VITE_BASE_PATH||'/';
 return {
  root,
  base:configuredBase.endsWith('/')?configuredBase:configuredBase+'/',
  plugins:[react()],
  resolve:{alias:{'@':root}},
  publicDir:'public',
  build:{outDir:'dist',emptyOutDir:true},
  server:{host:'127.0.0.1',port:5173},
  preview:{host:'127.0.0.1',port:4173},
 };
});
