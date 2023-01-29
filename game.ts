import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Player } from './player';

export class Game extends EventEmitter {
    session: string;
    plr1: Player;
    plr2: Player;

    constructor(plr1: Player, plr2: Player) {
        super();
        this.plr1 = plr1;
        this.plr2 = plr2;
        const salt = Math.floor(Math.random() * (500 - 1 + 1)) + 1;
        const plainSess = plr1.sock.remoteAddress + plr2.sock.remoteAddress;
        this.session = createHash('md5').update(plainSess + salt.toString()).digest('hex');
        this.start();
    }

    private start() {
        this.plr1.on('game-msg', (data) => this.handleGameMSG(this.plr1, data));
        this.plr2.on('game-msg', (data) => this.handleGameMSG(this.plr2, data));

        this.toOpponent(this.plr1, {
            opponent: this.plr1.id,
            kind: "Found"
        });

        this.toOpponent(this.plr2, {
            opponent: this.plr2.id,
            kind: "Found"
        });

        this.emit("start");
        // Now start the game
    }

    handleGameMSG(sender: Player, gameData) {

    }

    toOpponent(sender: Player, gd) {
        if (sender === this.plr1)
            this.plr2.send("Game-MSG", gd);
        else this.plr1.send("Game-MSG", gd);
    }

    toBoth(gd) {
        this.toOpponent(this.plr1, gd);
        this.toOpponent(this.plr2, gd);
    }
}