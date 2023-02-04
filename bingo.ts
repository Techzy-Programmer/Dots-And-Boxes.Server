import { Player } from './player';
import { Game } from './game';

export class BingoGame extends Game {
    private logic = new BingoLogic();

    constructor(plr1: Player, plr2: Player) {
        super("Bingo", plr1, plr2);
        this.start();
    }

    private start() {
        this.processBoth((p: Player) =>
            this.logic.setPlayer(p));

        this.onMessage((p, data) => {
            const msg = new BingoMSG(p, data);
            this.processMsg(msg);
        });
    }

    private processMsg(msg: BingoMSG) {
        // To-Do
    }
}

class BingoMSG {
    sender: Player;
    place: number;

    constructor(s, d) {
        this.sender = s;
        this.place = d.place;
    }
}

class BingoLogic {
    private plrs: Player[] = [];
    private gmap: { [id: number]: number[] } = {};

    setPlayer(p: Player) {
        const ar0 = Array.from({ length: 25 }, () => 0);
        this.gmap[p.id] = ar0;
        this.plrs.push(p);
    }

    generateBoard(): Array<{ p: Player, b: string[] }> {
        return this.plrs.map((p) => ({
            p, b: this.getBoard()
        }));
    }

    validatePlace(p: Player, n: number): boolean {
        if (n > 25 || n < 1) return false;
        let isOk: boolean = this.gmap[p.id][n - 1] == 0;
        if (isOk) this.gmap[p.id][n - 1] += 1;
        return isOk;
    }

    private getBoard(): string[] {
        let numsStr: string[] = [];
        for (var i = 1; i <= 25; i++)
            numsStr.push(i.toString());
        return numsStr.sort(() => (Math.random() - 0.5));
    }
}