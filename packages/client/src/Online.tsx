/**
 * Online play: a nickname and a deck, then create a room (best of one or three, optionally against the server's AI) and
 * share its code or link, or join a room by its code.
 */
import { AI_LEVELS, type AiLevel } from "@pocketmate/ai";
import { PRECONS } from "@pocketmate/cards/decks";
import { useState } from "react";
import { CardImage } from "./game/CardImage";
import { LangToggle } from "./LangToggle";
import { useLoc, useT } from "./localize";
import { useGame } from "./store";

export function Online() {
  const t = useT();
  const loc = useLoc();
  const lang = useGame((s) => s.lang);
  const nickname = useGame((s) => s.nickname);
  const deck = useGame((s) => s.deck);
  const setSettings = useGame((s) => s.setSettings);
  const online = useGame((s) => s.online);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const go = useGame((s) => s.go);
  const error = useGame((s) => s.error);
  const notice = useGame((s) => s.notice);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("room") ?? "");
  const [bestOf, setBestOf] = useState<1 | 3>(1);
  const [vsAi, setVsAi] = useState<AiLevel | "">("");
  const LEVEL: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Intermediate"), expert: t("Expert") };
  const room = online.room;
  const canPlay = nickname.trim().length > 0;
  if (room && room.status === "waiting") {
    const link = `${location.origin}/?room=${room.code}`;
    return (
      <div className="home">
        <header className="home-top">
          <h1 className="brand">PocketMate</h1>
          <LangToggle />
        </header>
        <main className="home-main">
          <h2>{t("Room created")}</h2>
          <p>{t("Give this code to your opponent:")}</p>
          <div className="room-code">{room.code}</div>
          <p className="room-link">
            {t("or this link:")} <a href={link}>{link}</a>
          </p>
          <p className="tagline">{t("Waiting for the opponent…")}</p>
          <button type="button" className="btn" onClick={leaveRoom}>
            {t("Leave the room")}
          </button>
        </main>
      </div>
    );
  }
  return (
    <div className="home">
      <header className="home-top">
        <h1 className="brand">PocketMate</h1>
        <LangToggle />
      </header>
      <main className="home-main">
        <button type="button" className="btn small" onClick={() => go("home")}>
          {t("Home")}
        </button>
        <h2>{t("Play online")}</h2>
        {notice ? <div className="notice">{loc(notice)}</div> : null}
        {error ? <div className="notice">{loc(error)}</div> : null}
        <label className="field">
          {t("Nickname")}
          <input value={nickname} maxLength={20} onChange={(e) => setSettings({ nickname: e.target.value })} />
        </label>
        <h2>{t("Your deck")}</h2>
        <div className="deck-list">
          {PRECONS.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`deck-tile${deck === p.id ? " chosen" : ""}`}
              onClick={() => setSettings({ deck: p.id })}
            >
              <CardImage defId={p.cover} />
              <span>{lang === "fr" ? (p.fr ?? p.name) : p.name}</span>
            </button>
          ))}
        </div>
        <div className="online-actions">
          <section className="panel">
            <h2>{t("Create a room")}</h2>
            <div className="seg">
              <button type="button" className={bestOf === 1 ? "on" : ""} onClick={() => setBestOf(1)}>
                {t("One game")}
              </button>
              <button type="button" className={bestOf === 3 ? "on" : ""} onClick={() => setBestOf(3)}>
                {t("Best of three")}
              </button>
            </div>
            <div className="seg">
              <button type="button" className={vsAi === "" ? "on" : ""} onClick={() => setVsAi("")}>
                {t("Against a player")}
              </button>
              {AI_LEVELS.map((l) => (
                <button type="button" key={l} className={vsAi === l ? "on" : ""} onClick={() => setVsAi(l)}>
                  {t("Server AI: {level}", { level: LEVEL[l] })}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={!canPlay || online.connecting}
              onClick={() => createRoom({ bestOf, ...(vsAi ? { ai: vsAi } : {}) })}
            >
              {t("Create")}
            </button>
          </section>
          <section className="panel">
            <h2>{t("Join a room")}</h2>
            <input
              className="code-input"
              placeholder={t("Code")}
              value={code}
              maxLength={8}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn primary"
              disabled={!canPlay || code.length < 4 || online.connecting}
              onClick={() => joinRoom(code)}
            >
              {t("Join")}
            </button>
          </section>
        </div>
        {!canPlay ? <p className="tagline">{t("Choose a nickname to play online.")}</p> : null}
      </main>
    </div>
  );
}
