import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Utility } from './utility';
import { Player } from './player';
import { Master } from './master';

export class Game extends EventEmitter {
    private dataListners: Array<((type: string, data?: any) => void)> = []; // Custom event implementation
    private msgListners: Array<((plr: Player, data: any) => void)> = []; // Custom event implementation
    opponent: { [id: number]: Player[] } = {}; // Player to it's all opponent map
    protected discPlrs: Set<string> = new Set();
    allPlrs: Map<string, Player> = new Map();
    private hasStarted: boolean = false;
    protected destroyer: NodeJS.Timeout;
    protected halted: boolean = false;
    respawnToken: string = "";
    name: string = "";

    constructor(gCode: string, gmName: string, ...plrs: Player[]) {
        super();
        this.name = gmName;
        let plainToken = "-";

        for (const plr of plrs) {
            plr.switchStatus(true);
            this.allPlrs.set(plr.dbRef, plr);
            plainToken += plr.dbRef + plr.name; // Let's make the session unique
            const opl = plrs.filter((p) => p != plr); // Get all opponents of curent user
            this.opponent[plr.dbRef] = opl; // And save the (player id => opponents[]) mapping
            plr.gameProps = {
                __gName: gmName,
                __gCode: gCode
            }
        }

        let randomFactor = Math.random();
        const salt = "r1$h@6H-=++g^@m^3r^2eR"; // Looks quite salty
        this.respawnToken = Utility.hash(`${plainToken}@${salt}#${randomFactor}`);
        Logger.log(Level.INFO, `${this.name} Game-Table Created`, `Players (${[...plrs]})`);
        this.initialize(); // Basic setup done let's start
    }

    spinLatency(pingPlr: Player) {
        setTimeout(() => pingPlr.gsend("Server-TS", {
            svrTS: Date.now()
        }), 500);
    }

    private initialize() {
        let pIds = [];
        let ackAll: Set<String> = new Set(); // Using Set to determine unique acknowledgement
        // Dictionary of all players to be sent to each of the connected player
        for (const curPlr of this.allPlrs.values()) pIds.push(curPlr.dbRef);

        this.processAll((p: Player) => {
            p.on('game-msg', (data) => {
                
                const gmData = data.data;
                switch (data.msg) {
                    case "Ack":
                        ackAll.add(p.dbRef);

                        if (ackAll.size == this.allPlrs.size) { // all acknowledgement received
                            this.processAll((ackPlr: Player) => {
                                ackPlr.gsend("Goto-Game", { plrIds: pIds });
                                this.spinLatency(ackPlr);
                            });

                            Logger.log(Level.INFO, `All Acknowledgement received for Game ${this.name}`);
                            this.hasStarted = true; data.msg = 'Safe-Init';
                            this.emit('start'); // Notify lobby
                        }
                        break;

                    case "Client-TS":
                        let svrTS = gmData?.svrTS;
                        let clTS = gmData?.clTS;

                        if (typeof svrTS === 'number' && typeof clTS === 'number') {
                            p.gsend("Server-ACK-TS", {
                                svrAckTS: Date.now(),
                                svrTS,
                                clTS
                            });

                            this.spinLatency(p);
                        }
                        return;

                    case "Respawn-Me":
                        if (this.discPlrs.has(p.dbRef) && p.gameProps.__secRspFactor === gmData?.srf) {
                            p.gsend("Goto-Game", {
                                srf: gmData.srf,
                                plrIds: pIds
                            });
                        }
                        break;
                }

                if (this.hasStarted)
                    // Send the received data to the child class
                    this.msgListners.forEach((callback) => callback(p, data));
            });

            p.on('leave', () => this.dataListners
                .forEach(cb => cb("Destroy")));

            p.on('disconnected', () => {
                this.dataListners.forEach(cb => cb("Halted"));
                p.gameProps.__discTime = Date.now();
                this.discPlrs.add(p.dbRef);

                if (!this.halted) {
                    this.destroyer = setTimeout(() => this.dataListners
                        .forEach(cb => cb("Destroy")), 5 * 60 * 1000);
                    this.halted = true;
                }

                this.broadcast("Disconnected", {
                    whoName: p.name, // Id not sent directly to client as it might not still have the player object
                    whoId: p.dbRef // This id is being sent for DOM manipulations only
                }, [p]);
            });

            p.gsend("Send-ACK", { rspTok: this.respawnToken }); // Players should send ack after receiving this
        });
    }

    // This event should be subscribed by the inheriting child classes
    protected onMessage(callback: (plr: Player, data?: any) => void) {
        this.msgListners.push(callback);
    }

    // This event should be subscribed by the inheriting child classes for important updates
    protected onCustomData(callback: (type: string, data: any) => void) {
        this.dataListners.push(callback);
    }

    protected toOpponent(sender: Player, gd) { // Send to each opponent of the Player('sender')
        this.opponent[sender.dbRef].forEach((oplr: Player) => {
            if (!this.discPlrs.has(oplr.dbRef))
                oplr.send("Game-MSG", gd);
        });
    }

    protected processAll(funcOperator: (p: Player) => void) {
        for (const p of this.allPlrs.values())
            funcOperator(p);
    }

    protected broadcast(msg: string, data?: any, except: Player[] = []) {
        this.processAll((p: Player) => !(except.includes(p))
            && !this.discPlrs.has(p.dbRef) &&
            p.send("Game-MSG", { msg, data }
        ));
    }

    // Inhereting child classes must call this function using super.dispose()
    dispose() {
        // Remove timers
        if (this.destroyer)
            clearTimeout(this.destroyer);

        // Remove all event listeners from all players
        this.processAll((p: Player) => {
            p.removeAllListeners('leave');
            p.removeAllListeners('game-msg');
            p.removeAllListeners('disconnected');
            if (p.status !== 'searching') p.status = 'idle';
        });

        // Clear all player data
        const delSuccess = Master.games.delete(this);
        this.discPlrs.clear();
        this.allPlrs.clear();
        this.opponent = {};

        // Clear all listeners
        this.dataListners = [];
        this.msgListners = [];

        // Reset flags
        this.hasStarted = false;
        this.halted = false;

        Logger.log(Level.INFO, `Game '${this.name}' has been disposed.`,
            `Reference removal from 'Master.games' was ${delSuccess ? "Successful" : "Unsuccessful"}!`);
    }
}
