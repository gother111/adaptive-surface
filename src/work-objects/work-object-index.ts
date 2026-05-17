import type { WorkObject } from "@/work-objects/work-object-types";

export type WorkObjectIndex = Record<string, WorkObject>;

export function indexWorkObjects(objects: WorkObject[]): WorkObjectIndex {
  return objects.reduce<WorkObjectIndex>((index, object) => {
    index[object.id] = object;
    return index;
  }, {});
}

export function mergeWorkObjectIndex(current: WorkObjectIndex, objects: WorkObject[]): WorkObjectIndex {
  return objects.reduce<WorkObjectIndex>(
    (index, object) => {
      index[object.id] = { ...index[object.id], ...object, metadata: { ...index[object.id]?.metadata, ...object.metadata } };
      return index;
    },
    { ...current },
  );
}

export function selectWorkObjects(index: WorkObjectIndex, ids: string[]) {
  return ids.map((id) => index[id]).filter((object): object is WorkObject => Boolean(object));
}
