import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Utility } from './utility';
import { Player } from './player';

export class Game extends EventEmitter {
    private msgListners: Array<((plr: Player, data: any) => void)> = []; // Custom event implementation
    opponent: { [id: number]: Player[] } = {}; // Player to it's all opponent map
    private hasStarted: boolean = false;
    respawnToken: string = "";
    all: Player[] = [];
    name: string = "";

    constructor(gmName: string, ...plrs: Player[]) {
        super();
        this.all = plrs;
        this.name = gmName;
        let plainToken = "-";

        for (var p = 0; p < plrs.length; p++) {
            const plr = plrs[p];
            plr.switchStatus(true);
            plainToken += plr.id + plr.name; // Let's make the session unique
            const opl = plrs.filter((p) => p != plr); // Get all opponents of curent user
            this.opponent[plr.id] = opl; // And save the (player id => opponents[]) mapping
        }

        let randomFactor = Math.random();
        const salt = "r1$h@6H-=++g^@m^3r^2eR"; // Looks quite salty
        this.respawnToken = Utility.hash(`${plainToken}@${salt}#${randomFactor}`);
        Logger.log(Level.INFO, `${this.name} Game-Table Created`, `Players (${[...plrs]})`);
        this.initialize(); // Basic setup done let's start
    }

    private initialize() {
        let pIds = [];
        let ackAll = new Set(); // Using Set to determine unique acknowledgement

        // Dictionary of all players to be sent to each of the connected player
        for (var i = 0; i < this.all.length; i++) {
            const curPlr = this.all[i];
            pIds.push(curPlr.id);
        }

        this.processAll((p: Player) => {
            p.on('game-msg', (data) => {
                function spinLatency(pingPlr: Player) {
                    setTimeout(() => pingPlr.gsend("Server-TS", {
                        svrTS: Date.now()
                    }), 500);
                }

                if (data.msg == "Ack") {
                    ackAll.add(p.id);

                    if (ackAll.size == this.all.length) { // all acknowledgement received
                        this.processAll((ackPlr: Player) => {
                            ackPlr.gsend("Goto-Game", { plrIds: pIds })
                            spinLatency(ackPlr);
                        });

                        Logger.log(Level.INFO, `All Acknowledgement received for Game ${this.name}`);
                        this.hasStarted = true; data.msg = 'Safe-Init';
                        this.emit('start'); // Notify lobby
                    }
                }
                else if (data.msg == "Client-TS") {
                    const tsData = data.data;
                    let svrTS = tsData?.svrTS;
                    let clTS = tsData?.clTS;

                    if (typeof svrTS === 'number' && typeof clTS === 'number') {
                        p.gsend("Server-ACK-TS", {
                            svrAckTS: Date.now(),
                            svrTS,
                            clTS
                        });

                        spinLatency(p);
                    }
                    return;
                }

                if (this.hasStarted)
                    // Send the received data to the child class
                    this.msgListners.forEach((callback) => callback(p, data));
            });

            p.gsend("Send-ACK", { rspTok: this.respawnToken }); // Players should send ack after receiving this
        });
    }

    // This event should be subscribed by the inheriting child classes
    onMessage(callback: (plr: Player, data: any) => void) {
        this.msgListners.push(callback);
    }

    toOpponent(sender: Player, gd) { // Send to each opponent of the Player('sender')
        this.opponent[sender.id].forEach((oplr) =>
            oplr.send("Game-MSG", gd));
    }

    processAll(funcOperator: Function) {
        this.all.forEach((p) => {
            funcOperator(p);
        });
    }

    broadcast(msg: string, data?: any, except: Player[] = []) {
        this.processAll((p: Player) => !(except.includes(p))
            && p.send("Game-MSG", { msg, data }));
    }
}
