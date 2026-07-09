import { useState } from 'react';
import Background from './components/Background';
import { buildTheme, APP_NAME } from './theme';
import { CHARACTERS, FACTION_META, ROOM_LIST, MATCH_HISTORY, shapeStyle } from './data/characters';
import { hexToRgba, darkenHex } from './utils/color';

import SelectScreen from './screens/SelectScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import HomeScreen from './screens/HomeScreen';
import CharactersScreen from './screens/CharactersScreen';
import RoomsScreen from './screens/RoomsScreen';
import RoomSettingsScreen from './screens/RoomSettingsScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import GameOverScreen from './screens/GameOverScreen';
import MypageScreen from './screens/MypageScreen';
import MypageSettingsScreen from './screens/MypageSettingsScreen';
import MypageRecordScreen from './screens/MypageRecordScreen';
import CharacterPanelOverlay from './components/CharacterPanelOverlay';
import SymbolPickerOverlay from './components/SymbolPickerOverlay';
import ContactModal from './components/ContactModal';

function buildMockPlayers(mode) {
  const evilRoles = CHARACTERS.filter((c) => c.faction === 'evil');
  const goodRoles = CHARACTERS.filter((c) => c.faction === 'good');
  const roster =
    mode === 6
      ? [evilRoles[0], evilRoles[1], goodRoles[0], goodRoles[1], goodRoles[2], goodRoles[3]]
      : CHARACTERS;
  return roster.map((c, i) => ({ num: i + 1, isMe: i === 0, character: c }));
}

export default function App() {
  const theme = buildTheme();
  const accent = theme.accentColor;

  const [screen, setScreen] = useState('select');

  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginStatus, setLoginStatus] = useState('idle'); // idle | loading | success

  const [signupId, setSignupId] = useState('');
  const [signupPw, setSignupPw] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupNickname, setSignupNickname] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupStatus, setSignupStatus] = useState('idle'); // idle | loading | success

  const [roomMode, setRoomMode] = useState(9);
  const [roomVisibility, setRoomVisibility] = useState('public');
  const [roomName, setRoomName] = useState('');
  const [charPanelOpen, setCharPanelOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [guessTarget, setGuessTarget] = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [myGuesses, setMyGuesses] = useState({});
  const [revealed, setRevealed] = useState({});
  const [dayNight, setDayNight] = useState('night');
  const [viewMode, setViewMode] = useState('all');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: '시스템', text: '밤이 되었습니다. 각자의 역할에 따라 행동하세요.', system: true },
    { sender: '3번', text: '오늘 밤은 유독 조용하네요.' },
    { sender: '5번', text: '해가 뜨면 다시 이야기하죠.' },
  ]);

  const [selectedCharId, setSelectedCharId] = useState('gumiho');
  const [winnerFaction, setWinnerFaction] = useState('good');
  const [pendingRoom, setPendingRoom] = useState(null);
  const [players, setPlayers] = useState(null);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [expandedMatchIndex, setExpandedMatchIndex] = useState(null);

  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsNewPw, setSettingsNewPw] = useState('');
  const [settingsPwError, setSettingsPwError] = useState('');
  const [settingsPwSaved, setSettingsPwSaved] = useState(false);

  // --- navigation ---
  const goToSelect = () => {
    setScreen('select');
    setLoginError('');
    setLoginStatus('idle');
    setSignupError('');
    setSignupStatus('idle');
  };
  const goToLogin = () => {
    setScreen('login');
    setSignupError('');
    setSignupStatus('idle');
  };
  const goToSignup = () => {
    setScreen('signup');
    setLoginError('');
    setLoginStatus('idle');
  };
  const goToHome = () => setScreen('home');
  const goToCharacters = () => setScreen('characters');
  const goToRooms = () => setScreen('rooms');
  const goToRoomSettings = () => setScreen('room-settings');
  const goToMypage = () => setScreen('mypage');
  const goToMypageRecord = () => setScreen('mypage-record');
  const goToGameOver = () => setScreen('game-over');
  const goToMypageSettings = () => {
    setScreen('mypage-settings');
    setSettingsSaved(false);
    setSettingsPwSaved(false);
    setSettingsPwError('');
    setSettingsNewPw('');
  };

  // --- rooms / lobby / game ---
  const submitRoomSettings = () => {
    setScreen('lobby');
    setPendingRoom({
      name: roomName.trim(),
      mode: roomMode,
      visibility: roomVisibility === 'public' ? '공개' : '비공개',
      joinedCount: 1,
    });
  };

  const joinMockRoom = (room) => {
    setRoomMode(room.mode);
    setScreen('lobby');
    setPendingRoom({ name: room.name, mode: room.mode, visibility: room.visibility, joinedCount: room.players + 1 });
  };

  const startGameFromLobby = () => {
    setScreen('game');
    setPlayers(buildMockPlayers(roomMode));
    setDayNight('night');
  };

  // --- mypage / contact ---
  const openContactModal = () => {
    setContactModalOpen(true);
    setContactMessage('');
    setContactSent(false);
  };
  const closeContactModal = () => setContactModalOpen(false);
  const submitContactMessage = () => {
    if (!contactMessage.trim()) return;
    setContactSent(true);
  };
  const toggleMatchExpand = (i) => setExpandedMatchIndex((cur) => (cur === i ? null : i));

  const saveSettings = () => setSettingsSaved(true);
  const saveNewPassword = () => {
    if (settingsNewPw.trim().length < 8) {
      setSettingsPwError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setSettingsPwSaved(true);
    setSettingsPwError('');
    setSettingsNewPw('');
  };

  // --- game screen ---
  const toggleDayNight = () => setDayNight((d) => (d === 'day' ? 'night' : 'day'));
  const toggleViewMode = () => setViewMode((v) => (v === 'all' ? 'faction' : 'all'));
  const openCharPanel = () => setCharPanelOpen(true);
  const closeCharPanel = () => setCharPanelOpen(false);
  const openSymbolPicker = (target) => {
    setSymbolPickerOpen(true);
    setGuessTarget(target);
  };
  const closeSymbolPicker = () => {
    setSymbolPickerOpen(false);
    setGuessTarget(null);
  };
  const selectSymbol = (charId) => {
    if (guessTarget === 'me') {
      setMySymbol(charId);
    } else {
      setMyGuesses((g) => ({ ...g, [guessTarget]: charId }));
    }
    setSymbolPickerOpen(false);
    setGuessTarget(null);
  };
  const toggleReveal = (num) => setRevealed((r) => ({ ...r, [num]: !r[num] }));

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((m) => [...m, { sender: '나', text, isMe: true }]);
    setChatInput('');
  };

  // --- auth ---
  const onLoginSubmit = () => {
    if (!loginId.trim() || !loginPw.trim()) {
      setLoginError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }
    setLoginStatus('loading');
    setLoginError('');
    setTimeout(() => setLoginStatus('success'), 650);
  };

  const onSignupSubmit = () => {
    if (!signupId.trim() || !signupPw.trim() || !signupEmail.trim() || !signupNickname.trim()) {
      setSignupError('모든 항목을 입력해주세요.');
      return;
    }
    if (signupPw.trim().length < 8) {
      setSignupError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      setSignupError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setSignupStatus('loading');
    setSignupError('');
    setTimeout(() => setSignupStatus('success'), 650);
  };

  // ---------------- derived view models ----------------
  const charactersView = CHARACTERS.map((c) => {
    const meta = FACTION_META[c.faction];
    return {
      ...c,
      factionLabel: meta.label,
      factionColor: meta.color,
      swatchStyle: shapeStyle(c.shape, meta.color),
      swatchStyleLarge: shapeStyle(c.shape, meta.color, 40),
      onSelect: () => selectSymbol(c.id),
      onSelectTab: () => setSelectedCharId(c.id),
      active: c.id === selectedCharId,
    };
  });
  const selectedCharacterView = charactersView.find((c) => c.id === selectedCharId) || charactersView[0];

  const guessColor = hexToRgba(accent, 0.4);
  const revealedColor = darkenHex(accent, 0.25);

  const playerList = players || buildMockPlayers(roomMode);
  const playersView = playerList.map((p) => {
    const meta = FACTION_META[p.character.faction];
    const isRevealed = !p.isMe && !!revealed[p.num];
    const guessedId = p.isMe ? mySymbol : myGuesses[p.num];
    const displayCharId = isRevealed ? p.character.id : guessedId || null;
    const displayChar = displayCharId ? CHARACTERS.find((c) => c.id === displayCharId) : null;
    const tier = isRevealed ? 'revealed' : guessedId ? 'guess' : 'none';
    const tierColor = tier === 'revealed' ? revealedColor : tier === 'guess' ? guessColor : null;

    return {
      ...p,
      factionLabel: meta.label,
      factionColor: meta.color,
      factionBg: meta.bg,
      factionBorder: meta.border,
      isOther: !p.isMe,
      symbolStyle: displayChar ? shapeStyle(displayChar.shape, tierColor) : null,
      claimedName: displayChar ? displayChar.name : '미공개',
      claimedFaction: displayChar ? displayChar.faction : null,
      onRowClick: p.isMe ? () => openSymbolPicker('me') : () => openSymbolPicker(p.num),
      onToggleReveal: (e) => {
        e.stopPropagation();
        toggleReveal(p.num);
      },
      revealToggleLabel: isRevealed ? '감정 취소' : '감정 결과 표시',
      rowStyleObj: { border: p.isMe ? '1px solid rgba(244,239,230,0.35)' : '1px solid transparent' },
      displayLabel: p.isMe ? '나' : p.num + '번',
      subtitleText: p.isMe ? '탭하여 문양 표시' : isRevealed ? '감정으로 확인됨' : guessedId ? '내 추측' : '정체 미공개',
    };
  });

  // 게임 종료 후 전체 공개용 (실제 직업 기준)
  const revealFactionGroups = ['evil', 'good', 'neutral']
    .map((f) => ({
      key: f,
      label: FACTION_META[f].label,
      color: FACTION_META[f].color,
      bg: FACTION_META[f].bg,
      border: FACTION_META[f].border,
      members: playersView.filter((p) => p.character.faction === f),
    }))
    .filter((g) => g.members.length > 0);

  // 게임 중 '진영별 보기'용 — 클레임/감정 정보 기준으로만 분류. 미확인 인원은 '미공개'로 묶는다.
  const unclaimedMembers = playersView.filter((p) => !p.claimedFaction);
  const claimedFactionGroups = ['evil', 'good', 'neutral']
    .map((f) => ({
      key: f,
      label: FACTION_META[f].label,
      color: FACTION_META[f].color,
      bg: FACTION_META[f].bg,
      border: FACTION_META[f].border,
      members: playersView.filter((p) => p.claimedFaction === f),
    }))
    .filter((g) => g.members.length > 0);
  const liveFactionGroups =
    unclaimedMembers.length > 0
      ? [
          ...claimedFactionGroups,
          {
            key: 'unclaimed',
            label: '미공개',
            color: 'rgba(244,239,230,0.55)',
            bg: 'rgba(244,239,230,0.05)',
            border: 'rgba(244,239,230,0.2)',
            members: unclaimedMembers,
          },
        ]
      : claimedFactionGroups;

  const chatMessagesView = chatMessages.map((m, i) => ({
    ...m,
    key: i,
    isChatMsg: !m.system,
    alignSelf: m.isMe ? 'flex-end' : 'flex-start',
    bubbleBg: m.isMe ? accent : 'rgba(244,239,230,0.07)',
    bubbleColor: m.isMe ? '#f3ece1' : '#f4efe6',
  }));

  const roomListView = ROOM_LIST.map((r, i) => ({ ...r, key: i, onJoin: () => joinMockRoom(r) }));

  const gameOverGroups = revealFactionGroups.map((g) => {
    const isWinner = g.key === winnerFaction;
    return {
      ...g,
      isWinner,
      cardStyle: isWinner
        ? { opacity: 1, filter: 'none', transform: 'scale(1.05)' }
        : { opacity: 0.4, filter: 'grayscale(0.6)', transform: 'scale(0.97)' },
    };
  });
  const winnerLabel = FACTION_META[winnerFaction]?.label ?? '';

  const lobbyPlayers = pendingRoom
    ? Array.from({ length: pendingRoom.mode }, (_, i) => {
        const joined = i < pendingRoom.joinedCount;
        const isMe = i === 0;
        return {
          num: i + 1,
          key: i,
          joined,
          isMe,
          opacityVal: joined ? 1 : 0.35,
          statusLabel: isMe ? '나' : joined ? '입장' : '대기 중',
        };
      })
    : [];

  const winCount = 14;
  const totalCount = 23;
  const matchHistoryView = MATCH_HISTORY.map((m, i) => {
    const matchPlayers = buildMockPlayers(m.mode).map((p) => {
      const meta = FACTION_META[p.character.faction];
      return { ...p, factionLabel: meta.label, factionColor: meta.color, factionBg: meta.bg, factionBorder: meta.border };
    });
    const isWin = m.result === '승';
    const expanded = expandedMatchIndex === i;
    return {
      ...m,
      key: i,
      isWin,
      expanded,
      players: matchPlayers,
      onToggle: () => toggleMatchExpand(i),
      resultBadgeColor: isWin ? '#f3ece1' : 'rgba(244,239,230,0.45)',
      resultBadgeBg: isWin ? accent : 'rgba(244,239,230,0.08)',
      toggleLabel: expanded ? '접기 ▲' : '참가자 보기 ▼',
    };
  });

  const dayNightDotColor = dayNight === 'day' ? '#e8c463' : '#7d8bb0';
  const dayNightLabel = dayNight === 'day' ? '낮 — 토론 시간' : '밤 — 행동 시간';
  const viewToggleLabel = viewMode === 'all' ? '진영별 보기' : '전체 보기';

  const loginButtonLabel = loginStatus === 'loading' ? '확인 중…' : loginStatus === 'success' ? '완료' : '로그인';
  const loginButtonAction = loginStatus === 'success' ? goToHome : onLoginSubmit;
  const signupButtonLabel = signupStatus === 'loading' ? '등록 중…' : signupStatus === 'success' ? '완료' : '가입하기';
  const signupButtonAction = signupStatus === 'success' ? goToHome : onSignupSubmit;

  const settingsIdDisplay = signupId && signupId.trim() ? signupId.trim() : '(로그인 시 사용한 아이디)';
  const nickname = signupNickname && signupNickname.trim() ? signupNickname.trim() : '이름 없는 나그네';
  const email = signupEmail && signupEmail.trim() ? signupEmail.trim() : '등록된 이메일 없음';
  const pickerTitle =
    guessTarget === 'me' ? '표시할 문양을 선택하세요' : guessTarget ? `${guessTarget}번의 문양을 추측해 표시하세요` : '';

  const screenProps = { theme, appName: APP_NAME };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: theme.bgBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Noto Sans KR', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Background theme={theme} />

      {screen === 'select' && <SelectScreen {...screenProps} goToLogin={goToLogin} goToSignup={goToSignup} />}

      {screen === 'login' && (
        <LoginScreen
          {...screenProps}
          loginId={loginId}
          loginPw={loginPw}
          loginError={loginError}
          loginSuccess={loginStatus === 'success'}
          loginButtonLabel={loginButtonLabel}
          onLoginIdChange={(e) => {
            setLoginId(e.target.value);
            setLoginError('');
          }}
          onLoginPwChange={(e) => {
            setLoginPw(e.target.value);
            setLoginError('');
          }}
          loginButtonAction={loginButtonAction}
          goToSelect={goToSelect}
          goToSignup={goToSignup}
        />
      )}

      {screen === 'signup' && (
        <SignupScreen
          {...screenProps}
          signupId={signupId}
          signupPw={signupPw}
          signupEmail={signupEmail}
          signupNickname={signupNickname}
          signupError={signupError}
          signupSuccess={signupStatus === 'success'}
          signupButtonLabel={signupButtonLabel}
          onSignupIdChange={(e) => {
            setSignupId(e.target.value);
            setSignupError('');
          }}
          onSignupPwChange={(e) => {
            setSignupPw(e.target.value);
            setSignupError('');
          }}
          onSignupEmailChange={(e) => {
            setSignupEmail(e.target.value);
            setSignupError('');
          }}
          onSignupNicknameChange={(e) => {
            setSignupNickname(e.target.value);
            setSignupError('');
          }}
          signupButtonAction={signupButtonAction}
          goToSelect={goToSelect}
          goToLogin={goToLogin}
        />
      )}

      {screen === 'home' && (
        <HomeScreen
          {...screenProps}
          goToSelect={goToSelect}
          goToMypage={goToMypage}
          goToCharacters={goToCharacters}
          goToRooms={goToRooms}
        />
      )}

      {screen === 'characters' && (
        <CharactersScreen
          {...screenProps}
          charactersView={charactersView}
          selectedCharacterView={selectedCharacterView}
          goToHome={goToHome}
        />
      )}

      {screen === 'rooms' && (
        <RoomsScreen {...screenProps} roomList={roomListView} goToHome={goToHome} goToRoomSettings={goToRoomSettings} />
      )}

      {screen === 'room-settings' && (
        <RoomSettingsScreen
          {...screenProps}
          roomMode={roomMode}
          roomVisibility={roomVisibility}
          roomName={roomName}
          setRoomMode={setRoomMode}
          setRoomVisibility={setRoomVisibility}
          onRoomNameChange={(e) => setRoomName(e.target.value)}
          submitRoomSettings={submitRoomSettings}
          goToRooms={goToRooms}
        />
      )}

      {screen === 'lobby' && (
        <LobbyScreen
          {...screenProps}
          pendingRoom={pendingRoom}
          lobbyPlayers={lobbyPlayers}
          startGameFromLobby={startGameFromLobby}
          goToRooms={goToRooms}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          {...screenProps}
          dayNightDotColor={dayNightDotColor}
          dayNightLabel={dayNightLabel}
          toggleDayNight={toggleDayNight}
          viewToggleLabel={viewToggleLabel}
          toggleViewMode={toggleViewMode}
          openCharPanel={openCharPanel}
          goToGameOver={goToGameOver}
          chatMessagesView={chatMessagesView}
          chatInput={chatInput}
          onChatInputChange={(e) => setChatInput(e.target.value)}
          sendChatMessage={sendChatMessage}
          isAllView={viewMode === 'all'}
          playersView={playersView}
          factionGroups={liveFactionGroups}
        />
      )}

      {screen === 'game-over' && (
        <GameOverScreen
          {...screenProps}
          winnerLabel={winnerLabel}
          gameOverGroups={gameOverGroups}
          setWinnerEvil={() => setWinnerFaction('evil')}
          setWinnerGood={() => setWinnerFaction('good')}
          goToHome={goToHome}
        />
      )}

      {screen === 'mypage' && (
        <MypageScreen
          {...screenProps}
          nickname={nickname}
          email={email}
          goToHome={goToHome}
          goToMypageRecord={goToMypageRecord}
          goToMypageSettings={goToMypageSettings}
          openContactModal={openContactModal}
        />
      )}

      {screen === 'mypage-settings' && (
        <MypageSettingsScreen
          {...screenProps}
          settingsIdDisplay={settingsIdDisplay}
          signupEmail={signupEmail}
          signupNickname={signupNickname}
          onSettingsEmailChange={(e) => {
            setSignupEmail(e.target.value);
            setSettingsSaved(false);
          }}
          onSettingsNicknameChange={(e) => {
            setSignupNickname(e.target.value);
            setSettingsSaved(false);
          }}
          saveSettings={saveSettings}
          settingsSaved={settingsSaved}
          settingsNewPw={settingsNewPw}
          onSettingsNewPwChange={(e) => {
            setSettingsNewPw(e.target.value);
            setSettingsPwError('');
            setSettingsPwSaved(false);
          }}
          saveNewPassword={saveNewPassword}
          settingsPwError={settingsPwError}
          settingsPwSaved={settingsPwSaved}
          goToMypage={goToMypage}
        />
      )}

      {screen === 'mypage-record' && (
        <MypageRecordScreen
          {...screenProps}
          winCount={winCount}
          totalCount={totalCount}
          matchHistoryView={matchHistoryView}
          goToMypage={goToMypage}
        />
      )}

      {charPanelOpen && (
        <CharacterPanelOverlay
          theme={theme}
          charactersView={charactersView}
          selectedCharacterView={selectedCharacterView}
          closeCharPanel={closeCharPanel}
        />
      )}

      {symbolPickerOpen && (
        <SymbolPickerOverlay
          theme={theme}
          charactersView={charactersView}
          pickerTitle={pickerTitle}
          closeSymbolPicker={closeSymbolPicker}
        />
      )}

      {contactModalOpen && (
        <ContactModal
          theme={theme}
          contactFormOpen={!contactSent}
          contactSent={contactSent}
          contactMessage={contactMessage}
          onContactMessageChange={(e) => setContactMessage(e.target.value)}
          submitContactMessage={submitContactMessage}
          closeContactModal={closeContactModal}
        />
      )}
    </div>
  );
}
