const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const { spawnCommandLineAsyncIO } = require("util"); //Misc Util
const { to_string } = require("tostring");

var DEVICE_TYPES = {};
var DEVICE_LIST = {};
var MOUNTED = {};

// Docs https://www.kernel.org/doc/Documentation/ABI/testing/procfs-diskstats
function getDiskStats() {
  let diskStats = {};

  let lines = to_string(GLib.file_get_contents("/proc/diskstats")[1]).trim().split("\n");
  for (let line of lines) {
    let diskstat = line.trim().split(/\s+/);

    if (!diskstat[2].startsWith("loop")) {
      global.log(diskstat[2]+": read: "+diskstat[5]+": write: "+diskstat[9])

      diskStats[diskstat[2]] = {
        id: diskstat[2],
        path: diskstat[2],
        read: diskstat[5],
        write: diskstat[9]
      };
    }
  }

  return diskStats;
}

function getMounted() {
  let command = "/bin/bash -c 'mount -l'";
  let subProcess = spawnCommandLineAsyncIO(
      command,
      (out, err, exitCode) => {
        if (exitCode === 0) {
          let lines = out.split("\n");
          for (let line of lines) {
            if (line.trim().length === 0) continue;
            //~ global.log("line.length = "+line.length);
            if (line.includes("ext") || line.includes("vfat") || line.includes("swap")) {
              let mnted = line.trim().split(/\s+/);
              global.log("mounted:"+mnted[0]+" on "+mnted[2]);
              MOUNTED[mnted[0]] = [mnted[0], mnted[2]]
            }
          }
        }
        getDiskStats();
        subProcess.send_signal(9);
      }
  );
}

function getDeviceList() {
  if (!Object.keys(DEVICE_LIST).length) {
    loadBlockDeviceList();
  }

  return DEVICE_LIST;
}

// Docs https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/6/html/deployment_guide/s2-proc-partitions#s2-proc-partitions
function loadBlockDeviceList() {
  const lines = to_string(GLib.file_get_contents("/proc/partitions")[1]).trim().split("\n");
  const deviceTypes = getBlockDeviceTypes();

  for (let line of lines) {
    const devicesList = line.trim().split(/\s+/);
    const deviceName = devicesList[3];
    const deviceTypeIdentifier = devicesList[0];
    const deviceTypeIdentifierName = deviceTypes[deviceTypeIdentifier]?.name || 'unknown';

    if (
        !deviceName
        || deviceName.startsWith("name")
        || deviceName.startsWith("zram")
        || deviceName.startsWith("zswap")
        || deviceTypeIdentifierName === 'zram'
        // device mapper from LVM
        || deviceName.startsWith("dm-")
        || deviceTypeIdentifierName === 'device-mapper'
    ) {
      continue;
    }

    DEVICE_LIST[deviceName] = {
      deviceTypeIdentifier: deviceTypeIdentifier,
      deviceTypeIdentifierName: deviceTypeIdentifierName,
      major: deviceTypeIdentifier,
      minor: devicesList[1],
      name: deviceName,
      blocksCount: devicesList[2]
    };
  }

  return DEVICE_LIST;
}

function getBlockDeviceTypes() {
  if (!Object.keys(DEVICE_TYPES).length) {
    loadBlockDeviceTypes();
  }

  return DEVICE_TYPES;
}

// Docs:
// https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/devices.txt
// https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/6/html/deployment_guide/s2-proc-devices#s2-proc-devices
function loadBlockDeviceTypes() {
  DEVICE_TYPES = {};

  const lines = to_string(GLib.file_get_contents("/proc/devices")[1]).trim().split("\n");
  let blockDevicesListBegan = false;

  for (let line of lines) {
    const row = line.trim().split(/\s+/);
    const identifier = row[0];
    const name = row[1];

    if (!name) {
      continue;
    }

    blockDevicesListBegan = blockDevicesListBegan || identifier.toLowerCase() == 'block';

    if (!blockDevicesListBegan) {
      continue;
    }

    DEVICE_TYPES[identifier] = {
      id: identifier,
      name: name,
      type: 'block'
    };
  }

  return DEVICE_TYPES;
}

module.exports = {
  getDiskStats,
  getMounted,
  getDeviceList,
  loadBlockDeviceList,
  getBlockDeviceTypes,
  MOUNTED,
}
