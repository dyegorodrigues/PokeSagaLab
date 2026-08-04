const SPRITECOLLAB_GRAPHQL_URL = "https://spriteserver.pmdcollab.org/graphql";
const INDEX_CACHE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_ASSET_HOSTS = new Set([
  "spriteserver.pmdcollab.org",
  "raw.githubusercontent.com",
]);

export interface SpriteCollabIndexEntry {
  id: string;
  numericId: string;
  name: string;
  path: string;
  formPath: string;
  hasAnimData: boolean;
  hasPortraits: boolean;
  portraitUrl?: string;
  animDataUrl: string;
  zipUrl?: string;
  phase: string;
  phaseRaw: number;
  canon: boolean;
  shiny: boolean;
  female: boolean;
  lastUpdated?: string;
}

export interface SpriteCollabActionAsset {
  kind: "sprite" | "copy";
  action: string;
  locked: boolean;
  copyOf?: string;
  animUrl?: string;
  offsetsUrl?: string;
  shadowsUrl?: string;
}

export interface SpriteCollabCharacterData {
  id: string;
  numericId: string;
  displayName: string;
  path: string;
  formPath: string;
  animDataXml: string;
  animDataUrl: string;
  zipUrl?: string;
  portraitUrl?: string;
  phase: string;
  phaseRaw: number;
  actions: SpriteCollabActionAsset[];
  credits: Array<{ id: string; name?: string; contact?: string }>;
  license: string;
  sourceCommit?: string;
  sourceUpdatedAt?: string;
}

interface GraphQlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

let indexCache:
  | {
      expiresAt: number;
      items: SpriteCollabIndexEntry[];
      sourceCommit?: string;
      sourceUpdatedAt?: string;
    }
  | undefined;

async function querySpriteCollab<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(SPRITECOLLAB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "SAGA-SpriteLab/1.0",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `SpriteCollab GraphQL respondeu HTTP ${response.status} ${response.statusText}`,
      );
    }

    const envelope = (await response.json()) as GraphQlEnvelope<T>;
    if (envelope.errors?.length) {
      throw new Error(
        `SpriteCollab GraphQL: ${envelope.errors
          .map((error) => error.message || "erro desconhecido")
          .join("; ")}`,
      );
    }
    if (!envelope.data) {
      throw new Error("SpriteCollab GraphQL retornou uma resposta sem dados.");
    }
    return envelope.data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCredits(
  primary?: { id: string; name?: string; contact?: string } | null,
  secondary: Array<{ id: string; name?: string; contact?: string }> = [],
) {
  const byId = new Map<string, { id: string; name?: string; contact?: string }>();
  for (const credit of [primary, ...secondary]) {
    if (credit?.id) byId.set(credit.id, credit);
  }
  return [...byId.values()];
}

export async function getSpriteCollabIndex(forceRefresh = false) {
  if (!forceRefresh && indexCache && indexCache.expiresAt > Date.now()) {
    return indexCache;
  }

  const query = /* GraphQL */ `
    query SagaSpriteCollabIndex {
      meta {
        assetsCommit
        assetsUpdateDate
      }
      monster {
        id
        rawId
        name
        forms {
          path
          fullPath
          fullName
          canon
          isShiny
          isFemale
          sprites {
            phase
            phaseRaw
            animDataXml
            zipUrl
            modifiedDate
          }
          portraits {
            previewEmotion {
              url
            }
          }
        }
      }
    }
  `;

  const data = await querySpriteCollab<{
    meta: { assetsCommit?: string; assetsUpdateDate?: string };
    monster: Array<{
      id: number;
      rawId: string;
      name: string;
      forms: Array<{
        path: string;
        fullPath: string;
        fullName: string;
        canon: boolean;
        isShiny: boolean;
        isFemale: boolean;
        sprites: {
          phase: string;
          phaseRaw: number;
          animDataXml?: string | null;
          zipUrl?: string | null;
          modifiedDate?: string | null;
        };
        portraits: { previewEmotion?: { url: string } | null };
      }>;
    }>;
  }>(query);

  const items: SpriteCollabIndexEntry[] = [];
  for (const monster of data.monster) {
    for (const form of monster.forms) {
      const animDataUrl = form.sprites.animDataXml;
      if (!animDataUrl) continue;
      const suffix = form.fullName?.trim();
      items.push({
        id: form.fullPath,
        numericId: monster.rawId,
        name: suffix ? `${monster.name} — ${suffix}` : monster.name,
        path: form.fullPath,
        formPath: form.path,
        hasAnimData: true,
        hasPortraits: Boolean(form.portraits.previewEmotion?.url),
        portraitUrl: form.portraits.previewEmotion?.url,
        animDataUrl,
        zipUrl: form.sprites.zipUrl || undefined,
        phase: form.sprites.phase,
        phaseRaw: form.sprites.phaseRaw,
        canon: form.canon,
        shiny: form.isShiny,
        female: form.isFemale,
        lastUpdated: form.sprites.modifiedDate || undefined,
      });
    }
  }

  items.sort((a, b) => {
    const idCompare = Number(a.numericId) - Number(b.numericId);
    return idCompare || a.path.localeCompare(b.path);
  });

  indexCache = {
    expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
    items,
    sourceCommit: data.meta.assetsCommit,
    sourceUpdatedAt: data.meta.assetsUpdateDate,
  };
  return indexCache;
}

export async function getSpriteCollabCharacter(
  requestedPath: string,
): Promise<SpriteCollabCharacterData> {
  const normalizedPath = requestedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.padStart(4, "0"))
    .join("/");
  const [rawId] = normalizedPath.split("/");
  const numericId = Number(rawId);
  if (!Number.isInteger(numericId) || numericId < 0) {
    throw new Error(`Caminho SpriteCollab inválido: ${requestedPath}`);
  }

  const query = /* GraphQL */ `
    query SagaSpriteCollabCharacter($filter: [Int!]) {
      meta {
        assetsCommit
        assetsUpdateDate
      }
      monster(filter: $filter) {
        id
        rawId
        name
        forms {
          path
          fullPath
          fullName
          portraits {
            previewEmotion {
              url
            }
          }
          sprites {
            phase
            phaseRaw
            animDataXml
            zipUrl
            creditPrimary {
              id
              name
              contact
            }
            creditSecondary {
              id
              name
              contact
            }
            actions {
              __typename
              ... on Sprite {
                action
                locked
                animUrl
                offsetsUrl
                shadowsUrl
              }
              ... on CopyOf {
                action
                locked
                copyOf
              }
            }
          }
        }
      }
    }
  `;

  const data = await querySpriteCollab<{
    meta: { assetsCommit?: string; assetsUpdateDate?: string };
    monster: Array<{
      rawId: string;
      name: string;
      forms: Array<{
        path: string;
        fullPath: string;
        fullName: string;
        portraits: { previewEmotion?: { url: string } | null };
        sprites: {
          phase: string;
          phaseRaw: number;
          animDataXml?: string | null;
          zipUrl?: string | null;
          creditPrimary?: { id: string; name?: string; contact?: string } | null;
          creditSecondary: Array<{ id: string; name?: string; contact?: string }>;
          actions: Array<{
            __typename: "Sprite" | "CopyOf";
            action: string;
            locked: boolean;
            animUrl?: string;
            offsetsUrl?: string;
            shadowsUrl?: string;
            copyOf?: string;
          }>;
        };
      }>;
    }>;
  }>(query, { filter: [numericId] });

  const monster = data.monster[0];
  if (!monster) throw new Error(`Pokémon ${rawId} não encontrado no SpriteCollab.`);

  const form =
    monster.forms.find((candidate) => candidate.fullPath === normalizedPath) ||
    (monster.forms.length === 1 ? monster.forms[0] : undefined);
  if (!form?.sprites.animDataXml) {
    throw new Error(`Forma ${normalizedPath} não possui sprites disponíveis.`);
  }

  const xmlResponse = await fetchWhitelistedAsset(form.sprites.animDataXml);
  const animDataXml = await xmlResponse.text();
  const suffix = form.fullName?.trim();

  return {
    id: form.fullPath,
    numericId: monster.rawId,
    displayName: suffix ? `${monster.name} — ${suffix}` : monster.name,
    path: form.fullPath,
    formPath: form.path,
    animDataXml,
    animDataUrl: form.sprites.animDataXml,
    zipUrl: form.sprites.zipUrl || undefined,
    portraitUrl: form.portraits.previewEmotion?.url,
    phase: form.sprites.phase,
    phaseRaw: form.sprites.phaseRaw,
    actions: form.sprites.actions.map((action) =>
      action.__typename === "CopyOf"
        ? {
            kind: "copy" as const,
            action: action.action,
            locked: action.locked,
            copyOf: action.copyOf,
          }
        : {
            kind: "sprite" as const,
            action: action.action,
            locked: action.locked,
            animUrl: action.animUrl,
            offsetsUrl: action.offsetsUrl,
            shadowsUrl: action.shadowsUrl,
          },
    ),
    credits: normalizeCredits(
      form.sprites.creditPrimary,
      form.sprites.creditSecondary,
    ),
    license: "Licença definida por contribuição no PMDCollab; consulte créditos e histórico do asset.",
    sourceCommit: data.meta.assetsCommit,
    sourceUpdatedAt: data.meta.assetsUpdateDate,
  };
}

export function assertAllowedAssetUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL de asset inválida.");
  }
  if (url.protocol !== "https:" || !ALLOWED_ASSET_HOSTS.has(url.hostname)) {
    throw new Error(`Host de asset não permitido: ${url.hostname || "desconhecido"}`);
  }
  return url;
}

export async function fetchWhitelistedAsset(rawUrl: string): Promise<Response> {
  const url = assertAllowedAssetUrl(rawUrl);
  const response = await fetch(url, {
    headers: { "User-Agent": "SAGA-SpriteLab/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Falha ao buscar asset: HTTP ${response.status}`);
  }
  return response;
}
