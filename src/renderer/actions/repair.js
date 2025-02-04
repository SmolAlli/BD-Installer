
import {progress/* , status*/} from "../stores/installation";
import {remote} from "electron";
import originalFs from "original-fs";
import rimraf from "rimraf";
import path from "path";
import install from "./install.js";
import {log, lognewline} from "./utils/log";
import succeed from "./utils/succeed";
import fail from "./utils/fail";
import exists from "./utils/exists";
import kill from "./utils/kill";
import reset from "./utils/reset";
import {showKillNotice} from "./utils/notices";
import doSanityCheck from "./utils/sanity";
import removeplugins from "./removeplugins";

const KILL_DISCORD_PROGRESS = 20;
const DELETE_APP_DIRS_PROGRESS = 50;
const DELETE_MODULE_DIRS_PROGRESS = 100;

const safeIsDir = (fullpath) => {
    try {
        return require("fs").lstatSync(fullpath).isDirectory();
    }
 catch {
        return false;
    }
};

async function deleteAppDirs(paths) {
    const progressPerLoop = (DELETE_APP_DIRS_PROGRESS - progress.value) / paths.length;
    for (const discordPath of paths) {
        log("Removing " + discordPath);
        const appPath = path.join(discordPath, "app");
        if (await exists(appPath)) {
            const error = await new Promise(resolve => rimraf(appPath, originalFs, resolve));
            if (error) {
                log(` Could not delete folder ${appPath}`);
                log(`❌ ${error.message}`);
                return error;
            }
        }
        log("✅ Deletion successful");
        progress.set(progress.value + progressPerLoop);
    }
}

const platforms = {stable: "Discord", ptb: "Discord PTB", canary: "Discord Canary"};
async function deleteModuleDirs(config) {
    const size = Object.keys(config).length;
    const progressPerLoop = (DELETE_MODULE_DIRS_PROGRESS - progress.value) / size;
    for (const channel in config) {
        const roaming = path.join(remote.app.getPath("userData"), "..", platforms[channel].replace(" ", "").toLowerCase());
        try {
            const versionDir = require("fs").readdirSync(roaming).filter((f) => safeIsDir(path.join(roaming, f)) && f.split(".").length > 1).sort().reverse()[0];
            const modulesPath = path.join(roaming, versionDir, "modules");
            log("Removing " + modulesPath);
            if (await exists(modulesPath)) {
                const error = await new Promise(resolve => rimraf(path.join(modulesPath), originalFs, resolve));
                if (error) {
                    log(`❌ Could not delete modules in ${roaming}`);
                    log(`❌ ${error.message}`);
                    return error;
                }
            }
            log("✅ Deletion successful");
            progress.set(progress.value + progressPerLoop);
        }
        catch (err) {
            log(`❌ Could not delete modules in ${roaming}`);
            log(`❌ ${err.message}`);
            return err;
        }
    }
}

async function showInstallNotice(config) {
    const confirmation = await remote.dialog.showMessageBox(remote.BrowserWindow.getFocusedWindow(), {
        type: "question",
        title: "Reinstall BetterDiscord?",
        message: "After repairing, you need to reinstall BetterDiscord. Would you like to do that now?",
        noLink: true,
        cancelId: 1,
        buttons: ["Yes", "No"]
    });

    if (confirmation.response !== 0) return succeed();

    await reset();
    await install(config);
    remote.dialog.showMessageBox(remote.BrowserWindow.getFocusedWindow(), {
        type: "info",
        title: "Reinstall Complete",
        message: "Please relaunch discord manually to finish the repair."
    });
}

async function showPluginRemoveNotice() {
    const confirmation = await remote.dialog.showMessageBox(remote.BrowserWindow.getFocusedWindow(), {
        type: "question",
        title: "Remove BetterDiscord plugins?",
        message: "Remove BetterDiscord plugins?",
        detail: 
`If you are repairing due to a plugins issue, or crashing, backup your plugins and then press \"yes\".
If you are repairing for other reasons, or do not want to remove your plugins, press \"no\".
Plugins folder can be found at ${path.join(remote.app.getPath("appData"), "BetterDiscord", "plugins")}.
Note: This will not touch any other folder or files.`,
        noLink: true,
        cancelId: 1,
        buttons: ["Yes", "No"]
    });

    if (confirmation.response !== 0) return succeed();

    await reset();
    await removeplugins();
}


export default async function(config) {
    await reset();
    const sane = doSanityCheck(config);
    if (!sane) return fail();

    const channels = Object.keys(config);
    const paths = Object.values(config);

    lognewline("Killing Discord...");
    const killErr = await kill(channels, (KILL_DISCORD_PROGRESS - progress.value) / channels.length, false); // await killProcesses(channels);
    if (killErr) {
        showKillNotice();
        return fail();
    }
    log("✅ Discord Killed");
    progress.set(KILL_DISCORD_PROGRESS);

    await new Promise(r => setTimeout(r, 200));
    lognewline("Deleting shims...");
    const deleteShimErr = await deleteAppDirs(paths);
    if (deleteShimErr) return fail();
    log("✅ Shims deleted");
    progress.set(DELETE_APP_DIRS_PROGRESS);
    
    // Doesn't remove the modules folder on linux
    if (process.platform !== "linux") {
        await new Promise(r => setTimeout(r, 200));
        lognewline("Deleting discord modules...");
        const deleteModulesErr = await deleteModuleDirs(config);
        if (deleteModulesErr) return fail();
        log("✅ Modules deleted");
    }
    progress.set(DELETE_MODULE_DIRS_PROGRESS);

    const didError = await showPluginRemoveNotice();
    if (didError) return; 
    
    showInstallNotice(config);
};