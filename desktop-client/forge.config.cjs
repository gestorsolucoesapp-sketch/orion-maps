const path = require("node:path");

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "Orion Maps",
    icon: path.join(__dirname, "assets", "orion-maps"),
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "OrionMaps",
        setupExe: "OrionMapsSetup.exe",
        setupIcon: path.join(__dirname, "assets", "orion-maps.ico"),
      },
    },
  ],
};
