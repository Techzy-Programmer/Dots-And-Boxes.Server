import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Player } from './player';

export class Game extends EventEmitter {
    private msgListners: Array<((plr: Player, data: any) => void)> = [];
    opponent: { [id: number]: Player };
    both: Player[] = [];
    session: string;
    name: string;

    constructor(gmName: string, plr1: Player, plr2: Player){
        super();
        this.name = gmName;
        this.both.push(plr1);
        this.both.push(plr2);
        this.opponent[plr1.id] = plr2;
        this.opponent[plr2.id] = plr1;
        const salt = Math.floor(Math.random() * (500 - 1 + 1)) + 1;
        const plainSess = plr1.sock.remoteAddress + plr2.sock.remoteAddress;
        this.session = createHash('md5').update(plainSess + salt.toString()).digest('hex');
        Logger.log(Level.INFO, `${this.name} Game-Table Created`,
            `Players (${plr1.name} vs ${plr2.name})`);
        this.initialize()
    }

    private initialize() {
        this.processBoth((p: Player) => {
            p.on('game-msg', (data) =>
                this.msgListners.forEach((callback) => {
                    callback(p, data);
                })
            );
        });

        this.processBoth((p: Player) => // ACK
            this.toOpponent(p, {
                session: this.session,
                opponent: p.id,
                kind: "Found"
            })
        );
    }

    onMessage(callback: (plr: Player, data: any) => void) {
        this.msgListners.push(callback);
    }

    toOpponent(sender: Player, gd) {
        this.opponent[sender.id].send("Game-MSG", gd);
    }

    processBoth(funcOperator: Function) {
        this.both.forEach((p) => {
            funcOperator(p);
        });
    }
}
