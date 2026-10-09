import { defineConfig } from 'vite';
import { createRoomApi } from './server/http';
import { attachInputChannel } from './server/input-channel';
export default defineConfig({
  plugins:[{
    name:'city-loop-rooms',
    configureServer(server){
      const api=createRoomApi();
      const inputs=server.httpServer?attachInputChannel(server.httpServer,api.service):null;
      server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/rooms'))void api.handler(req,res);else next();});
      server.httpServer?.once('close',()=>{inputs?.close();api.close();});
    },
  }],
});
