import * as fs from 'fs';
import { basename } from 'path';

export enum Level { // Level of logging
    ERROR,
    WARN,
    INFO
}

export abstract class Logger {
    private static logDir = `${__dirname}/logs`;
    private static isLocal: boolean;

    static initialize(local: boolean) {
        process.on('uncaughtException', (err) => {
            Logger.log(Level.ERROR, "Unhandled Error Encountered",
                `[Msg]=> ${err.toString()}`, `[Stack]=> ${err.stack}`);
        });

        fs.mkdirSync(this.logDir, { recursive: true });
        process.env.TZ = 'Asia/Kolkata';
        this.isLocal = local;
    }

    // Main logging happens here
    static log(type: Level, ...data) {
        // Lets detect who called this Logger.log function
        const e = new Error(); // Using error object
        const regex = /\((.*):(\d+):(\d+)\)$/;
        const match = regex.exec(e.stack.split("\n")[2]);
        const file = basename(match[1]);
        const column = match[3];
        const line = match[2];

        // Get Date & Time at which this log happens
        const nowDt = (new Date()).toLocaleString('en-GB', { hour12: true });

        const logObj = { // Build a logging object
            caller: `file(${file}) line(${line}) column(${column})`,
            time: nowDt, type: Level[type], data
        };

        if (this.isLocal) { // Whether to display log to console directly
            let clr = '';
            let rset = '%s\x1b[0m';

            if (type == Level.INFO) clr = '\x1b[36m';
            else if (type == Level.WARN) clr = '\x1b[33m';
            else if (type == Level.ERROR) clr = '\x1b[31m';
            console.log(clr + rset, JSON.stringify(logObj, null, 2));
            return;
        }

        // Or to write it up in a '.json' file

        let jsLog: Array<any> = [];
        const lPath = `${this.logDir}/dataLogs.json`;

        try {
            let jsData = fs.readFileSync(lPath, 'utf-8');
            jsLog = JSON.parse(jsData);
        }
        catch {
            // Don't know why this has occured
            // I think I shoud not log this
        }

        jsLog.push(logObj);
        fs.writeFileSync(lPath,
            JSON.stringify(jsLog, null, 2)); // Done
    }
}
