import type { User } from "@supabase/supabase-js";

type ProfilePayload = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string;
};

const USERNAME_MAX_LENGTH = 24;
const USERNAME_SUFFIX_LENGTH = 9;

function getStringMetadataValue(
  metadata: User["user_metadata"],
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export const getDefaultUsername = (userId: string) =>
  `user_${userId.slice(0, 8)}`;

function getSafeUsername(candidate: string | null, userId: string) {
  const suffix = `_${userId.slice(0, USERNAME_SUFFIX_LENGTH - 1)}`;
  const normalized = candidate
    ?.toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!normalized || normalized.length < 3) {
    return getDefaultUsername(userId);
  }

  const baseLength = USERNAME_MAX_LENGTH - suffix.length;
  return `${normalized.slice(0, baseLength)}${suffix}`;
}

export const getProfilePayload = (user: User): ProfilePayload => {
  const displayName =
    getStringMetadataValue(user.user_metadata, [
      "full_name",
      "name",
      "display_name",
    ]) ??
    user.email?.split("@")[0] ??
    "Predict26 Player";
  const avatarUrl = getStringMetadataValue(user.user_metadata, [
    "avatar_url",
    "picture",
  ]);
  const username = getSafeUsername(
    getStringMetadataValue(user.user_metadata, [
      "user_name",
      "preferred_username",
      "username",
    ]) ?? user.email?.split("@")[0] ?? null,
    user.id
  );

  return {
    id: user.id,
    display_name: displayName,
    avatar_url: avatarUrl,
    username,
  };
};
