import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const project=process.cwd();
const server=await createServer({configFile:false,root:path.join(project,'tests/interface-preview'),publicDir:path.join(project,'public'),plugins:[react()],resolve:{alias:{'@':project}},server:{host:'127.0.0.1',port:5175,strictPort:true,fs:{allow:[project]}}});
await server.listen();server.printUrls();
