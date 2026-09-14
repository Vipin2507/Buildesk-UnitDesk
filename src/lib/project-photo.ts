export const DEFAULT_PROJECT_PHOTO = "/project-preview.png";

/** Custom upload wins; otherwise the shared project preview render. */
export function resolveProjectPhotoUrl(photoUrl?: string | null) {
  return photoUrl || DEFAULT_PROJECT_PHOTO;
}

export function isCustomProjectPhoto(photoUrl?: string | null) {
  return Boolean(photoUrl);
}
