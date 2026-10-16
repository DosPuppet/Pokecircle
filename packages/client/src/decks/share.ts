/**
 * A deck shared by a link and its QR code: `https://…/#deck=1.<data>`. The data is the TCG Live list (English, with set
 * codes) compressed with deflate and written in base64url. The fragment (#) never reaches the server; Pokecircle offers
 * to import the deck when the link is opened.
 */
import { type DeckEntries, serializeDeckList } from "@pokecircle/cards/decklist";

const PREFIX = "#deck=";
const VERSION = "1";

export function shareText(name: string, entries: DeckEntries): string {
  return `${name ? `// ${name}\n` : ""}${serializeDeckList(entries, "en")}\n`;
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

export async function deckLink(name: string, entries: DeckEntries, origin: string = location.origin): Promise<string> {
  const packed = await through(new TextEncoder().encode(shareText(name, entries)), new CompressionStream("deflate-raw"));
  return `${origin}/${PREFIX}${VERSION}.${toBase64Url(packed)}`;
}

export function sharedDeckData(urlOrHash: string): string | null {
  const i = urlOrHash.indexOf(PREFIX);
  return i < 0 ? null : urlOrHash.slice(i + PREFIX.length) || null;
}

/** The decklist (text, to import) of a link's data; null when damaged or of an unknown version. */
export async function decodeDeck(data: string): Promise<string | null> {
  const [version, payload] = data.split(".", 2);
  if (version !== VERSION || !payload) return null;
  try {
    return new TextDecoder().decode(await through(fromBase64Url(payload), new DecompressionStream("deflate-raw")));
  } catch {
    return null;
  }
}

/** The deck name carried by a shared list ("// name" first line). */
export function sharedName(text: string): string {
  const m = /^\/\/\s*(.+)$/m.exec(text);
  return m ? (m[1] as string).trim() : "";
}
