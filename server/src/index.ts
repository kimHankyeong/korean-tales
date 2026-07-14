/**
 * korean_tales 실시간 게임 서버
 *
 * Socket.io 이벤트 계약은 shared/src/socket/events.ts, 방/게임 연결은
 * server/src/socket/registerHandlers.ts 참고. 게임 규칙은 docs/requirements.md가 원본.
 */

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { CHARACTERS } from '@korean-tales/shared';
import { registerHandlers } from './socket/registerHandlers';

const PORT = Number(process.env.PORT ?? 4000);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' }, // 개발용 — 배포 시 도메인 제한
});

registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`korean_tales server listening on :${PORT} (characters loaded: ${CHARACTERS.length})`);
});
