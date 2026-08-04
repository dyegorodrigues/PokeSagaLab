import assert from "node:assert/strict";
import test from "node:test";
import {
  AnimDataParseError,
  parseAnimDataXml,
} from "../src/domain/parser/animDataParser";

const validXml = `<?xml version="1.0"?>
<AnimData>
  <ShadowSize>1</ShadowSize>
  <Anims>
    <Anim>
      <Name>Walk</Name>
      <Index>0</Index>
      <FrameWidth>40</FrameWidth>
      <FrameHeight>40</FrameHeight>
      <Durations>
        <Duration>4</Duration>
        <Duration>4</Duration>
      </Durations>
    </Anim>
    <Anim>
      <Name>Dance</Name>
      <CopyOf>Walk</CopyOf>
    </Anim>
  </Anims>
</AnimData>`;

test("parses a concrete action and resolves CopyOf metadata", () => {
  const parsed = parseAnimDataXml(validXml);
  assert.equal(parsed.shadowSize, 1);
  assert.equal(parsed.anims.length, 2);

  const walk = parsed.anims[0];
  const dance = parsed.anims[1];
  assert.deepEqual(walk.durations, [4, 4]);
  assert.equal(dance.copyOf, "Walk");
  assert.equal(dance.frameWidth, 40);
  assert.equal(dance.frameHeight, 40);
  assert.deepEqual(dance.durations, [4, 4]);
});

test("rejects a concrete action without durations", () => {
  assert.throws(
    () =>
      parseAnimDataXml(`
        <AnimData>
          <Anims>
            <Anim>
              <Name>Idle</Name>
              <FrameWidth>32</FrameWidth>
              <FrameHeight>32</FrameHeight>
            </Anim>
          </Anims>
        </AnimData>
      `),
    (error: unknown) =>
      error instanceof AnimDataParseError && /Durations/.test(error.message),
  );
});

test("rejects CopyOf cycles instead of fabricating frames", () => {
  assert.throws(
    () =>
      parseAnimDataXml(`
        <AnimData>
          <Anims>
            <Anim><Name>A</Name><CopyOf>B</CopyOf></Anim>
            <Anim><Name>B</Name><CopyOf>A</CopyOf></Anim>
          </Anims>
        </AnimData>
      `),
    (error: unknown) =>
      error instanceof AnimDataParseError && /Ciclo de CopyOf/.test(error.message),
  );
});

test("rejects invalid XML with a useful parser error", () => {
  assert.throws(
    () => parseAnimDataXml("<AnimData><Anims></AnimData>"),
    (error: unknown) => error instanceof AnimDataParseError,
  );
});
