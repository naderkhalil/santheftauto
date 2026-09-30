import { defineConfig } from 'vite';
import { createRoomApi } from './server/http';
export default defineConfig({
  plugins:[{
    name:'city-loop-rooms',
    configureServer(server){
      const api=createRoomApi();
      server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/rooms'))void api.handler(req,res);else next();});
      server.httpServer?.once('close',()=>api.close());
    },
  }],
});
