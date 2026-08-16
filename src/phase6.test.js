import test from "node:test";
import assert from "node:assert/strict";

import { createSceneRecord } from "./domain/records.js";
import {
  adjustArtworkBy,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  clampCameraZoom,
  clampMapScale,
  clientPointToPercent,
  createPlayToken,
  createWall,
  DEFAULT_CAMERA,
  DEFAULT_MAP_VIEW,
  midpointPercent,
  normalizeCamera,
  normalizeMapView,
  normalizeTableToken,
  normalizeWalls,
  panCameraBy,
  removeToken,
  rulerDistanceFeet,
  screenToWorld,
  setArtworkScale,
  updateToken,
  worldToScreen,
  zoomCameraAt,
  zoomCameraAtViewportCenter,
} from "./domain/table.js";
import { createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-16T12:00:00.000Z";

test("camera defaults and zoom clamps are exact", () => {
  assert.deepEqual(DEFAULT_CAMERA, { x: 0, y: 0, zoom: 1 });
  assert.equal(clampCameraZoom(-20), CAMERA_MIN_ZOOM);
  assert.equal(clampCameraZoom(20), CAMERA_MAX_ZOOM);
  assert.equal(clampCameraZoom(1.75), 1.75);
  assert.deepEqual(normalizeCamera({ x: "12", y: -8, zoom: 9 }), { x: 12, y: -8, zoom: 3 });
});

test("cursor-anchored zoom leaves the world point beneath the cursor fixed", () => {
  const camera = { x: 80, y: -45, zoom: 0.8 };
  const cursor = { x: 713, y: 281 };
  const before = screenToWorld(cursor, camera);
  const zoomed = zoomCameraAt(camera, 2.25, cursor);
  const after = screenToWorld(cursor, zoomed);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test("center controls anchor zoom at the viewport center and reset is exact", () => {
  const viewport = { width: 1440, height: 900 };
  const center = { x: 720, y: 450 };
  const camera = { x: 120, y: 70, zoom: 1.2 };
  const before = screenToWorld(center, camera);
  const zoomed = zoomCameraAtViewportCenter(camera, 1.7, viewport);
  assert.deepEqual(screenToWorld(center, zoomed), before);
  assert.deepEqual(normalizeCamera(DEFAULT_CAMERA), DEFAULT_CAMERA);
});

test("camera pan uses screen delta and coordinate transforms remain inverse", () => {
  assert.deepEqual(panCameraBy({ x: 10, y: 20, zoom: 2 }, { x: -7, y: 9 }), { x: 3, y: 29, zoom: 2 });
  for (const camera of [
    { x: 0, y: 0, zoom: 1 },
    { x: -800, y: 430, zoom: 0.35 },
    { x: 315, y: -210, zoom: 3 },
  ]) {
    for (const point of [{ x: 0, y: 0 }, { x: 1920, y: 1080 }, { x: -450, y: 700 }]) {
      const roundTrip = screenToWorld(worldToScreen(point, camera), camera);
      assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9);
      assert.ok(Math.abs(roundTrip.y - point.y) < 1e-9);
    }
  }
});

test("artwork transform is independent, clamped, and divides drag by camera zoom", () => {
  assert.deepEqual(DEFAULT_MAP_VIEW, { scale: 1, x: 0, y: 0 });
  assert.equal(clampMapScale(-1), 0.2);
  assert.equal(clampMapScale(99), 5);
  assert.deepEqual(normalizeMapView({ scale: 8, x: 12, y: -90 }), { scale: 5, x: 12, y: -90 });
  assert.deepEqual(adjustArtworkBy({ scale: 2, x: 4, y: 6 }, { x: 30, y: -18 }, 3), { scale: 2, x: 14, y: 0 });
  assert.deepEqual(setArtworkScale({ scale: 1, x: 33, y: -44 }, 0.1), { scale: 0.2, x: 33, y: -44 });
});

test("transformed client coordinates produce stable world percentages", () => {
  assert.deepEqual(clientPointToPercent({ x: 400, y: 250 }, { left: 100, top: 50, width: 600, height: 400 }), { xPercent: 50, yPercent: 50 });
  assert.deepEqual(clientPointToPercent({ x: -50, y: 700 }, { left: 50, top: 100, width: 200, height: 300 }), { xPercent: -50, yPercent: 200 });
});

test("token, wall, and ruler percentages stay aligned across zoom and viewport sizes", () => {
  const percentage = { xPercent: 37.5, yPercent: 62.5 };
  for (const viewport of [{ width: 800, height: 600 }, { width: 1440, height: 900 }, { width: 2560, height: 1080 }]) {
    for (const camera of [{ x: 0, y: 0, zoom: 1 }, { x: -370, y: 240, zoom: 0.35 }, { x: 510, y: -190, zoom: 3 }]) {
      const worldPoint = { x: viewport.width * percentage.xPercent / 100, y: viewport.height * percentage.yPercent / 100 };
      const client = worldToScreen(worldPoint, camera);
      const rect = { left: camera.x, top: camera.y, width: viewport.width * camera.zoom, height: viewport.height * camera.zoom };
      const recovered = clientPointToPercent(client, rect);
      assert.ok(Math.abs(recovered.xPercent - percentage.xPercent) < 1e-9);
      assert.ok(Math.abs(recovered.yPercent - percentage.yPercent) < 1e-9);
    }
  }
});

test("Play tokens receive stable records and can move, rename, and be removed", () => {
  const first = createPlayToken({ id: "token-a", ordinal: 0 });
  const second = createPlayToken({ id: "token-b", ordinal: 1, name: "Scout" });
  assert.equal(first.name, "Token 1");
  assert.equal(second.name, "Scout");
  assert.notEqual(first.color, second.color);
  const moved = updateToken([first, second], first.id, { name: "Guide", position: { xPercent: -20, yPercent: 145 } });
  assert.equal(moved[0].id, "token-a");
  assert.equal(moved[0].name, "Guide");
  assert.deepEqual(moved[0].position, { xPercent: -20, yPercent: 145 });
  assert.deepEqual(removeToken(moved, "token-a").map((token) => token.id), ["token-b"]);
});

test("token normalization validates combat-shaped fields without importing Hero state", () => {
  const token = normalizeTableToken({
    id: "manual",
    heroId: null,
    name: "Manual",
    hp: 99,
    maxHp: 7,
    ac: -2,
    baseSpeed: 30,
    level: 50,
    position: { xPercent: 25, yPercent: 75 },
  });
  assert.equal(token.hp, 7);
  assert.equal(token.maxHp, 7);
  assert.equal(token.ac, 0);
  assert.equal(token.level, 20);
  assert.equal(token.heroId, null);
});

test("full and half walls normalize to persisted percentage polylines", () => {
  const full = createWall({ id: "wall-full", type: "full", points: [{ xPercent: 1, yPercent: 2 }, { xPercent: 3, yPercent: 4 }] });
  const half = createWall({ id: "wall-half", type: "half", points: [{ xPercent: -5, yPercent: 8 }, { xPercent: 140, yPercent: 90 }] });
  assert.equal(full.type, "full");
  assert.equal(half.type, "half");
  assert.deepEqual(normalizeWalls([full, half, { id: "bad", points: [] }]), [full, half]);
  assert.throws(() => createWall({ id: "short", points: [{ xPercent: 1, yPercent: 1 }] }));
});

test("ruler counts four-connected crossed squares, excludes origin, and multiplies by five", () => {
  const options = { width: 440, height: 440, gridSize: 44 };
  assert.equal(rulerDistanceFeet({ xPercent: 5, yPercent: 5 }, { xPercent: 5, yPercent: 5 }, options), 0);
  assert.equal(rulerDistanceFeet({ xPercent: 5, yPercent: 5 }, { xPercent: 35, yPercent: 5 }, options), 15);
  assert.equal(rulerDistanceFeet({ xPercent: 5, yPercent: 5 }, { xPercent: 35, yPercent: 25 }, options), 25);
  assert.deepEqual(midpointPercent({ xPercent: 10, yPercent: 20 }, { xPercent: 50, yPercent: 80 }), { xPercent: 30, yPercent: 50 });
});

test("Scene normalization persists map view, walls, visibility, and Play tokens but never a camera", () => {
  const scene = createSceneRecord({
    kind: "play",
    mapView: { scale: 9, x: 125, y: -88 },
    wallsVisible: false,
    walls: [{ id: "wall", type: "half", points: [{ xPercent: 0, yPercent: 0 }, { xPercent: 100, yPercent: 100 }] }],
    tokens: [{ id: "token", name: "Keeper", position: { xPercent: 30, yPercent: 40 } }],
    camera: { x: 900, y: 900, zoom: 3 },
  }, { id: "scene", now: NOW });
  assert.deepEqual(scene.mapView, { scale: 5, x: 125, y: -88 });
  assert.equal(scene.wallsVisible, false);
  assert.equal(scene.walls[0].type, "half");
  assert.equal(scene.tokens[0].name, "Keeper");
  assert.equal("camera" in scene, false);
});

test("Phase 6 Scene state survives a fresh repository instance", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    clock: () => NOW,
    idFactory: () => "scene-phase6",
  });
  const repository = makeRepository();
  const token = createPlayToken({ id: "persisted-token" });
  const wall = createWall({ id: "persisted-wall", type: "full", points: [{ xPercent: 10, yPercent: 15 }, { xPercent: 80, yPercent: 60 }] });
  const created = repository.create({ kind: "play", tokens: [token], walls: [wall], wallsVisible: false, mapView: { scale: 1.4, x: 33, y: -12 } });
  assert.equal(created.ok, true);
  const loaded = makeRepository().get(created.value.id);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.value.mapView, { scale: 1.4, x: 33, y: -12 });
  assert.deepEqual(loaded.value.walls, [wall]);
  assert.equal(loaded.value.wallsVisible, false);
  assert.equal(loaded.value.tokens[0].id, "persisted-token");
  assert.equal("camera" in loaded.value, false);
});

test("Scene repository updates persist completed Table operations", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    clock: () => NOW,
    idFactory: () => "updated-scene",
  });
  const repository = makeRepository();
  const created = repository.create({ kind: "play" }).value;
  const token = createPlayToken({ id: "updated-token" });
  const wall = createWall({ id: "updated-wall", type: "half", points: [{ xPercent: 1, yPercent: 2 }, { xPercent: 90, yPercent: 70 }] });
  const updated = repository.update(created.id, {
    tokens: [token], walls: [wall], wallsVisible: false, mapView: { scale: 2.2, x: -120, y: 48 },
  });
  assert.equal(updated.ok, true);
  const reloaded = makeRepository().get(created.id).value;
  assert.equal(reloaded.tokens[0].id, "updated-token");
  assert.deepEqual(reloaded.walls, [wall]);
  assert.equal(reloaded.wallsVisible, false);
  assert.deepEqual(reloaded.mapView, { scale: 2.2, x: -120, y: 48 });
});

test("a failed Table persistence write preserves the last valid Scene", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    clock: () => NOW,
    idFactory: () => "failure-scene",
  });
  const created = repository.create({ kind: "play", mapView: { scale: 1, x: 0, y: 0 } }).value;
  storage.setFailureMode("write");
  const failed = repository.update(created.id, { mapView: { scale: 3, x: 900, y: 900 } });
  assert.equal(failed.ok, false);
  storage.setFailureMode(null);
  assert.deepEqual(repository.get(created.id).value.mapView, { scale: 1, x: 0, y: 0 });
});
