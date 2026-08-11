const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

export const resolveCardAssetUrl = (
  path: string,
  runtimeBaseUrl?: string
): string | undefined => {
  const baseUrl = runtimeBaseUrl || process.env.TARO_APP_CARD_ASSET_BASE_URL;
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/$/, "")}/${trimSlashes(path)}`;
};

export const cardBackAssetUrl = (runtimeBaseUrl?: string): string | undefined =>
  resolveCardAssetUrl("cards/webp/card-back.webp", runtimeBaseUrl);
