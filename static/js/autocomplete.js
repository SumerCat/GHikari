/**
 * GHikari Toolbox - Autocomplete Library
 * Provides structured command suggestions for ADB and Fastboot.
 */

const AutocompleteLibrary = {
    adb: {
        commands: {
            "devices": "List connected devices",
            "shell": "Run remote shell interactive command",
            "logcat": "View device log",
            "install": "Install an Android application",
            "uninstall": "Uninstall an Android application",
            "push": "Copy local files/directories to device",
            "pull": "Copy files/directories from device",
            "reboot": "Reboot the device",
            "reboot recovery": "Reboot into recovery mode",
            "reboot bootloader": "Reboot into bootloader",
            "reboot sideload": "Reboot into sideload mode",
            "sideload": "Sideload a package",
            "connect": "Connect to a device via TCP/IP",
            "disconnect": "Disconnect from a TCP/IP device",
            "forward": "Forward socket connections",
            "reverse": "Reverse socket connections",
            "get-state": "Print device state",
            "get-serialno": "Print device serial number",
            "help": "Show adb help"
        },
        options: {
            "-s": "Specify device serial number",
            "-d": "Direct an adb command to the only connected USB device",
            "-e": "Direct an adb command to the only connected emulator"
        }
    },
    fastboot: {
        commands: {
            "devices": "List devices in bootloader mode",
            "reboot": "Reboot device normally",
            "reboot bootloader": "Reboot device into bootloader",
            "reboot-bootloader": "Reboot device into bootloader",
            "reboot recovery": "Reboot device into recovery",
            "flash": "Flash a partition with an image file",
            "flashall": "Flash all partitions from $ANDROID_PRODUCT_OUT",
            "update": "Flash all partitions from a zip file",
            "erase": "Erase a flash partition",
            "format": "Format a flash partition",
            "getvar": "Display a bootloader variable",
            "boot": "Download and boot a kernel image",
            "unlock": "Unlock the bootloader",
            "lock": "Lock the bootloader",
            "oem": "Run OEM-specific commands",
            "flashing unlock": "Unlock the bootloader (modern devices)",
            "flashing lock": "Lock the bootloader (modern devices)",
            "help": "Show fastboot help"
        }
    },
    system: {
        "cls": "Clear the terminal output",
        "clear": "Clear the terminal output",
        "help": "Show toolbox help",
        "scrcpy": "Start screen mirroring"
    }
};

/**
 * Get suggestions based on current input string
 * @param {string} input 
 * @returns {Array} List of suggestion objects {cmd, desc}
 */
function getSuggestions(input) {
    const trimmed = input.trimStart();
    if (!trimmed) return [];

    const parts = trimmed.split(/\s+/);
    const mainCmd = parts[0].toLowerCase();

    let matches = [];

    if (parts.length === 1) {
        // Suggest main commands
        const allMain = ['adb', 'fastboot', 'scrcpy', 'cls', 'clear', 'help'];
        allMain.forEach(c => {
            if (c.startsWith(mainCmd)) {
                let desc = "";
                if (c === 'adb') desc = "Android Debug Bridge";
                if (c === 'fastboot') desc = "Android Flash Tool";
                if (AutocompleteLibrary.system[c]) desc = AutocompleteLibrary.system[c];
                matches.push({ cmd: c, desc: desc });
            }
        });
    } else {
        // Subcommands
        let lib = null;
        if (mainCmd === 'adb') lib = AutocompleteLibrary.adb.commands;
        if (mainCmd === 'fastboot') lib = AutocompleteLibrary.fastboot.commands;

        if (lib) {
            const subCmdPart = parts.slice(1).join(' ').toLowerCase();
            for (const [cmd, desc] of Object.entries(lib)) {
                if (cmd.toLowerCase().startsWith(subCmdPart)) {
                    matches.push({ cmd: `${mainCmd} ${cmd}`, desc: desc });
                }
            }
        }
    }

    return matches;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutocompleteLibrary, getSuggestions };
}
