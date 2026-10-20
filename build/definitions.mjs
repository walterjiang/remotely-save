// Only these documented application settings are embedded in the plugin.
const names = [
  "DROPBOX_APP_KEY",
  "ONEDRIVE_CLIENT_ID",
  "ONEDRIVE_AUTHORITY",
  "REMOTELYSAVE_WEBSITE",
  "REMOTELYSAVE_CLIENT_ID",
  "GOOGLEDRIVE_CLIENT_ID",
  "GOOGLEDRIVE_CLIENT_SECRET",
  "BOX_CLIENT_ID",
  "BOX_CLIENT_SECRET",
  "PCLOUD_CLIENT_ID",
  "PCLOUD_CLIENT_SECRET",
  "YANDEXDISK_CLIENT_ID",
  "YANDEXDISK_CLIENT_SECRET",
  "KOOFR_CLIENT_ID",
  "KOOFR_CLIENT_SECRET",
];

/** @returns {Record<string, string>} */
export function createDefinitions(env = process.env) {
  return {
    ...Object.fromEntries(
      names.map((name) => [
        `global.DEFAULT_${name}`,
        JSON.stringify(env[name] || ""),
      ])
    ),
    "process.env.NODE_DEBUG": "undefined",
    "process.env.DEBUG": "undefined",
    // Keep the Azure SDK on its browser code path.
    "globalThis.process.versions": "undefined",
  };
}

export default createDefinitions();
