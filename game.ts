import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Player } from './player';

export class Game extends EventEmitter {
    private msgListners: Array<((plr: Player, data: any) => void)> = [];
    opponent: { [id: number]: Player[] } = {};
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
            plainSess += plr.sock.remoteAddress;
            const opl = plrs.filter((p) => p != plr);
            this.opponent[plr.id] = opl;
        }

        const salt = Math.floor(Math.random() * (500 - 1 + 1)) + 1;
        this.session = createHash('md5').update(plainSess + salt.toString()).digest('hex');
        Logger.log(Level.INFO, `${this.name} Game-Table Created`, `Players (${[...plrs]})`);
        this.initialize();
    }

    private initialize() {
        let pIds = {};

        for (var i = 0; i < this.all.length; i++) {
            const curPlr = this.all[i];
            pIds[curPlr.id] = curPlr.name;
        }

        this.processAll((p: Player) => {
            let ackAll = new Set();

            p.on('game-msg', (data) => {
                if (data.type == "Ack") {
                    ackAll.add(p.id);

                    if (ackAll.size == this.all.length) {
                        this.hasStarted = true;
                        this.emit('start');
                    }

                    return;
                }

                if (this.hasStarted) {
                    this.msgListners.forEach((callback) => {
                        callback(p, data);
                    });
                }
            });

            p.send("Game-MSG", {
                session: this.session,
                players: pIds,
                msg: "Found"
            });
        });
    }

    onMessage(callback: (plr: Player, data: any) => void) {
        this.msgListners.push(callback);
    }

    toOpponent(sender: Player, gd) {
        this.opponent[sender.id].forEach((oplr) =>
            oplr.send("Game-MSG", gd));
    }

    processAll(funcOperator: Function) {
        this.all.forEach((p) => {
            funcOperator(p);
        });
    }
}
