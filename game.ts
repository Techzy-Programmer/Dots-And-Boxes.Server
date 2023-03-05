import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Player } from './player';

export class Game extends EventEmitter {
    private msgListners: Array<((plr: Player, data: any) => void)> = []; // Custom event implementation
    opponent: { [id: number]: Player[] } = {}; // Player to it's all opponent map
    private hasStarted: boolean = false;
    session: string = "";
    all: Player[] = [];
    name: string = "";

    constructor(gmName: string, ...plrs: Player[]){
        super();
        this.all = plrs;
        this.name = gmName;
        let plainSess = "-";

        for (var p = 0; p < plrs.length; p++) {
            const plr = plrs[p];
            plr.switchStatus(true);
            plainSess += plr.sock.remoteAddress; // Let's make the session unique
            const opl = plrs.filter((p) => p != plr); // Get all opponents of curent user
            this.opponent[plr.id] = opl; // And save the (player id => opponents[]) mapping
        }

        const salt = Math.floor(Math.random() * (500 - 1 + 1)) + 1; // Quite salty here
        this.session = createHash('md5').update(plainSess + salt.toString()).digest('hex');
        Logger.log(Level.INFO, `${this.name} Game-Table Created`, `Players (${[...plrs]})`);
        this.initialize(); // Basic setup done let's start
    }

    private initialize() {
        let pIds = {};

        // Dictionary of all players to be sent to each of the connected player
        for (var i = 0; i < this.all.length; i++) {
            const curPlr = this.all[i];
            pIds[curPlr.id] = curPlr.name;
        }

        this.processAll((p: Player) => {
            let ackAll = new Set(); // Using Set to determine unique acknowledgement

            p.on('game-msg', (data) => {
                if (data.type == "Ack") {
                    ackAll.add(p.id);

                    if (ackAll.size == this.all.length) { // all acknowledgement received
                        this.hasStarted = true;
                        this.emit('start'); // Notify lobby that this game has now been started
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
                session: this.session,
                players: pIds,
                msg: "Found"
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
