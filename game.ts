import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Player } from './player';
import { Utility } from './utility';

export class Game extends EventEmitter {
    private msgListners: Array<((plr: Player, data: any) => void)> = []; // Custom event implementation
    opponent: { [id: number]: Player[] } = {}; // Player to it's all opponent map
    private hasStarted: boolean = false;
    respawnToken: string = "";
    all: Player[] = [];
    name: string = "";

    constructor(gmName: string, ...plrs: Player[]){
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
        let pIds = {};
        let ackAll = new Set(); // Using Set to determine unique acknowledgement

        // Dictionary of all players to be sent to each of the connected player
        for (var i = 0; i < this.all.length; i++) {
            const curPlr = this.all[i];
            pIds[curPlr.id] = curPlr.name;
        }

        this.processAll((p: Player) => {

            p.on('game-msg', (data) => {
                if (data.type == "Ack") {
                    ackAll.add(p.id);

                    if (ackAll.size == this.all.length) { // all acknowledgement received
                        this.hasStarted = true;
                        this.emit('start'); // Notify lobby that this game has now started
                    }

                    return;
                }

                if (this.hasStarted) {
                    this.msgListners.forEach((callback) => {
                        callback(p, data); // Send the received data to the child class
                    });
                }
            });

            p.send("Game-MSG", { // Players should send ack after receiving this
                rspTok: this.respawnToken,
                msg: "Send-ACK",
                players: pIds
            });
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
}
