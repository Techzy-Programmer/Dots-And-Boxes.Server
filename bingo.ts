import { Player } from './player';
import { Game } from './game';

export class BingoGame extends Game {
    private logic = new BingoLogic();

    constructor(...plrs: Player[]) {
        super("Bingo", ...plrs);
        this.start();
    }

    private start() {
        this.processAll((p: Player) =>
            this.logic.setPlayer(p));

        this.onMessage((p, data) => {
            const msg = new BingoMSG(p, data);
            this.processMsg(msg);
        });
    }

    private processMsg(msg: BingoMSG) {
        switch (msg.type) {
            case "Turn":
                break;

            case "Chat":
                break;

            default:
                break;
        }
    }
}

class BingoMSG {
    type: string;
    sender: Player;
    message: string;
    point2D: number[];

    constructor(s, d) {
        this.sender = s;
        this.type = d.type;
        this.message = d.msg;
        this.point2D = d.point2D;
    }
}

class BingoLogic {
    private plrs: Player[] = [];
    private numsStr: string[] = [];
    private boardMap: { [id: number]: string[] };
    private gmap: { [id: number]: Map<number, number[]> } = {};

    constructor() {
        let incCount = 1;
        this.numsStr = Array.from({ length: 25 }, () => `${incCount++}`);
    }

    setPlayer(p: Player) {
        // Initialize logic variables for given player
        const posMap = new Map<number, number[]>();
        const ar0 = Array.from({ length: 5 }, () => 0);
        for (var i = 0; i < 5; i++) posMap.set(i, ar0);
        this.gmap[p.id] = posMap;
        this.plrs.push(p);

        // Generate and send the Bingo game board to the player
        for (const p of this.plrs) {
            let board = this.getBoard();
            this.boardMap[p.id] = board;
            p.send("Game-MSG", {
                msg: 'board',
                board
            });
        }
    }

    validatePlace(plr: Player, pos: number[]): string {
        if (!this.validatePosition(pos) || this.gmap[plr.id][pos[0]][pos[1]] !== 0) {
            return "";
        }

        this.gmap[plr.id][pos[0]][pos[1]]++;
        return this.boardMap[plr.id][pos[0] + pos[1]];
    }

    private validatePosition(pos: number[]): boolean {
        for (var i = 0; i < 2; i++) {
            if (pos[i] > 4 || pos[i] < 0)
                return false;
        }

        return true;
    }

    private getBoard(): string[] {
        return this.numsStr.sort(() =>
            (Math.random() - 0.5));
    }
}
