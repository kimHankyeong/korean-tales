/**
 * korean_tales 실시간 게임 서버 (스켈레톤)
 *
 * 아직 게임 로직 없음 — Socket.io 연결 수립과 shared 패키지 연동만 확인한다.
 * 게임 상태 머신(XState)·방 관리·타이머는 이후 세션에서 docs/requirements.md 기반으로 구현.
 */

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { CHARACTERS } from '@korean-tales/shared';

const PORT = Number(process.env.PORT ?? 4000);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' }, // 개발용 — 배포 시 도메인 제한
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`korean_tales server listening on :${PORT} (characters loaded: ${CHARACTERS.length})`);
});
