import { Player } from './player';
import { Game } from './game';

export class BingoGame extends Game {
    private logic = new BingoLogic();

    constructor(...plrs: Player[]) {
        /*
         * [To-Do] Dispose game properly
         * Broadcast that game has now ended
         * Remove all listners like (Player.on())
         * Make variables null & remove reference from Master.games[]
        */

        super("Bingo", ...plrs);
        // this.start();

        this.all.forEach(p => p.on("disconnected", () => {
            p.on("respawn", (rspTok) => {
                if (rspTok === this.respawnToken) {
                    // Okay! Now Resume the game
                }
            });

            /*
             * [To-Do] Pause this game room
             * Wait for player to respawn within next 5 minutes
             * Respawn based on same respawn token given to each player of this game
             * End the game if player doesn't respawns in 5 minutes
            */
        }));
    }

    private start() {
        // Loop through all players in current game and
        // run the logic function on them one by one
        this.processAll((p: Player) =>
            this.logic.setPlayer(p));

        this.onMessage((p, data) => {
            const msg = new BingoMSG(p, data); // Convert JSON msg to class object
            this.processMsg(msg);
        });
    }

    private processMsg(msg: BingoMSG) {
        // [To-Do]: handle message
        switch (msg.type) {
            case "Turn":
                break;

            case "Chat":
                break;

            default: // [To-Do]: implement logging
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
        let board = this.getBoard();
        this.boardMap[p.id] = board;
        p.send("Game-MSG", {
            msg: 'board',
            board
        });
    }

    validatePlace(plr: Player, pos: number[]): string {
        // If indexes of 2d point of gameboard is not in range 0 to 4 then it's invalid
        // also if the value at the 2d point is already used then player is probable trying to cheat.
        if (!this.validatePosition(pos) || this.gmap[plr.id][pos[0]][pos[1]] !== 0) {
            return "";
        }

        this.gmap[plr.id][pos[0]][pos[1]]++;
        return this.boardMap[plr.id][pos[0] + pos[1]];
        // Increment 2d value at given board position and return value at that position
    }

    private validatePosition(pos: number[]): boolean {
        for (var i = 0; i < 2; i++) {
            if (pos[i] > 4 || pos[i] < 0)
                return false;
        }

        return true;
    }

    private getBoard(): string[] {
        // Shuffle the array and return a random board
        return this.numsStr.sort(() =>
            (Math.random() - 0.5));
    }
}
