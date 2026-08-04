import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWhitelistedAsset,
  getSpriteCollabCharacter,
  getSpriteCollabIndex,
} from "../server/services/spritecollabService";

const enabled = process.env.RUN_EXTERNAL_INTEGRATION === "1";

test(
  "loads a real character and its PMD assets from the official SpriteCollab API",
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const index = await getSpriteCollabIndex(true);
    assert.ok(index.items.length > 0, "official index should not be empty");
    assert.ok(index.sourceCommit, "official index should expose its asset commit");

    const pikachu = index.items.find((item) => item.numericId === "0025");
    assert.ok(pikachu, "Pikachu should exist in the official index");
    assert.ok(pikachu.path, "Pikachu entry should expose a full form path");

    const character = await getSpriteCollabCharacter(pikachu.path);
    assert.equal(character.numericId, "0025");
    assert.match(character.animDataXml, /<AnimData>/);
    assert.ok(character.actions.length > 0);

    const spriteAction = character.actions.find(
      (action) => action.kind === "sprite" && action.animUrl,
    );
    assert.ok(spriteAction?.animUrl, "character should expose at least one sprite sheet");

    const response = await fetchWhitelistedAsset(spriteAction.animUrl);
    assert.ok(response.ok);
    assert.match(response.headers.get("content-type") || "", /image\/png/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 8);
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  },
);
