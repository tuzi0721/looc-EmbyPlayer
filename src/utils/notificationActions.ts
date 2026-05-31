import type { Router } from "vue-router";

import type { AppNotification, NotificationAction } from "@/types/models";

function objectPayload(action: NotificationAction): Record<string, unknown> {
  return action.payload && typeof action.payload === "object"
    ? (action.payload as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function runNotificationAction(
  router: Router,
  notification: AppNotification,
  action: NotificationAction,
) {
  switch (action.kind) {
    case "navigate": {
      const route = stringValue(objectPayload(action).route);
      if (route) await router.push(route);
      break;
    }
    case "open-task": {
      const taskId = stringValue(objectPayload(action).taskId) ?? notification.sourceId ?? null;
      await router.push(
        taskId
          ? { name: "downloads", query: { task: taskId } }
          : { name: "downloads" },
      );
      break;
    }
    default:
      break;
  }
}
