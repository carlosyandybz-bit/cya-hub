import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("app/cya-app.tsx", "utf8");
const home = readFileSync("app/home-view.tsx", "utf8");
const notifications = readFileSync("app/notifications-view.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("notifications have their own view", () => {
  assert.match(app, /\| "notifications"/);
  assert.match(app, /<NotificationsView/);
  assert.match(app, /navigateView\("notifications"\)/);
});

test("home no longer renders notification feed", () => {
  assert.doesNotMatch(home, /home-notifications/);
  assert.doesNotMatch(home, /internal_notifications/);
});

test("bell changes when actionable notifications exist", () => {
  assert.match(app, /unreadNotificationCount \? <BellRing \/> : <Bell \/>/);
  assert.match(app, /notification-dot/);
  assert.match(css, /notification-trigger\.has-notifications/);
});

test("notification screen resolves mission priority and precise person or class targets", () => {
  assert.match(notifications, /priority_score/);
  assert.match(notifications, /origin\.person_id/);
  assert.match(notifications, /origin\.class_id/);
  assert.match(app, /context\.classId/);
  assert.match(app, /context\.personId/);
});

test("invalid notification targets are not navigated", () => {
  assert.match(notifications, /validTargets\.has\(target\)/);
});
