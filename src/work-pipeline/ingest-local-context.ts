import type { AppleContextBundle, LocalContextPreview } from "@/types/context";
import {
  normalizeAppleCalendarEventsToWorkObjects,
  normalizeAppleMailMessagesToWorkObjects,
  normalizeAppleNotesToWorkObjects,
  normalizeFileDirectoryToWorkObjects,
} from "@/work-objects/work-object-normalizer";
import type { WorkObject } from "@/work-objects/work-object-types";

export function ingestAppleContextBundle(bundle: AppleContextBundle): WorkObject[] {
  return [
    ...normalizeAppleCalendarEventsToWorkObjects(bundle.calendarEvents),
    ...normalizeAppleMailMessagesToWorkObjects(bundle.mailMessages),
    ...normalizeAppleNotesToWorkObjects(bundle.notes),
  ];
}

export function ingestLocalContextPreview(preview: LocalContextPreview): WorkObject[] {
  return normalizeFileDirectoryToWorkObjects(preview);
}
