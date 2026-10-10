import { defineConfig } from 'vite';
import { createRoomApi } from './server/http';
import { attachInputChannel } from './server/input-channel';
import { createLeaderboardApi } from './server/leaderboard-http';
export default defineConfig({
  plugins:[{
    name:'city-loop-rooms',
    configureServer(server){
      const api=createRoomApi();
      const leaderboard=createLeaderboardApi({rooms:api.service});
      const inputs=server.httpServer?attachInputChannel(server.httpServer,api.service):null;
      server.middlewares.use((req,res,next)=>{void(async()=>{if(await leaderboard.handler(req,res))return;if(req.url?.startsWith('/api/rooms'))await api.handler(req,res);else next();})().catch(next);});
      server.httpServer?.once('close',()=>{inputs?.close();api.close();});
    },
  }],
});
