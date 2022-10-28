
import {progress} from "../stores/installation";
import {promises as fs} from "fs";
import path from "path";
import {remote} from "electron";
import {log, lognewline} from "./utils/log";
import fail from "./utils/fail";

const REMOVE_DIR_PROGRESS = 100;

const folder = path.join(remote.app.getPath("appData"), "BetterDiscord", "plugins");

const safeIsDir = (fullpath) => {
    try {
        return require("fs").lstatSync(fullpath).isDirectory();
    }
    catch {
        return false;
    }
};

async function removeDirectory() {
    if (!safeIsDir(folder)) {
        log(`⚠️ Plugins folder does not exist.`);
        return false;
    }

    try {
        await fs.rmdir(folder);
    }
    catch (err) {
        log(`❌ Failed to remove directory: ${folder}`);
        log(`❌ ${err.message}`);
        return err;
    }
}

export default async function() {
    lognewline("Removing plugins folder...");
    const removeDirErr = await removeDirectory();

    if (removeDirErr === false) return;

    if (removeDirErr) return fail();

    log("✅ Plugins folder cleared");
    progress.set(REMOVE_DIR_PROGRESS);
}