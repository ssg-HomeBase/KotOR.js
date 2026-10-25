/**
 * KOTOR III (fan): a fan-made sequel prototype that runs as a mod on top of the player's own
 * KOTOR II install. The player points this entry at their KOTOR II folder; the engine loads the
 * base game from there, then the mod files in mods/kotor3/ that ship with this build.
 * Not affiliated with or endorsed by Lucasfilm, Disney, Obsidian, BioWare or Aspyr.
 */
export const LauncherConfig: any = {
  "name": "KOTOR III (fan)",
  "full_name": "KOTOR III fan sequel prototype (requires your own KOTOR II)",
  "icon": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/208580/c491c003d93f0947b8e514ff1933daa7c4d8c171.ico",
  "logo": "https://steamcdn-a.akamaihd.net/steam/apps/208580/logo.png",
  "background": "./images/vqMNET.jpg",
  "background_fallback": "./images/vqMNET.jpg",
  "category": "game",
  "directory": null,
  "locate_required": true,
  "isForgeCompatible": false,
  "steam_id" : 208580,
  "width": 1200,
  "height": 600,
  "mod": "kotor3",
  "base_game": "tsl",
  "executable": {
    "win": "swkotor2.exe",
    "mac": "KOTORII.app"
  },
  "launch": {
    "type": "electron",
    "path": "game/index.html",
    "args": { "gameChoice": 2 },
    "backgroundColor": "#000000",
    "fullscreen": true
  },
  "verify_install_dir": true,
  "elements" : [],
  "settings" : {
    "fullscreen": {
      "name": "Fullscreen at launch?",
      "type": "boolean",
      "defaultValue": true
    },
    "devtools": {
      "name": "Open Devtools at launch?",
      "type": "boolean",
      "defaultValue": false
    }
  }
}
