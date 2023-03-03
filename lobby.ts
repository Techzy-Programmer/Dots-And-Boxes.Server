import { BingoGame } from './bingo';
import { Player } from './player';
import { Server } from './server';

export abstract class Lobby {
    static finders: { [id: number]: Player[] } = {};
    static maxPlrs: { [id: string]: number } = {
        'bgo': 4,
        'ttt': 2,
    };

    static addFinder(plr: Player, gId, numPlr): boolean {
        if (!(gId in this.maxPlrs) || numPlr < 2 || numPlr > this.maxPlrs[gId]) {
            return false;
        }

        plr.gnum = numPlr;
        plr.switchStatus();
        this.finders[numPlr].push(plr);
        this.tryMatch(numPlr);
        return true;
    }

    static removeFinder(plr: Player) {
        if (plr?.gnum in this.finders) {
            let idx = this.finders[plr?.gnum].indexOf(plr);
            if (idx > -1) this.finders[plr?.gnum].splice(idx, 1);
        }
    }

    private static tryMatch(keyPlr) {
        if (this.finders[keyPlr].length == keyPlr) {
            const matchPlrs = this.finders[keyPlr];
            this.finders[keyPlr].length = 0;
            let game = new BingoGame(...matchPlrs);
            game.on("start", () => this.handleGameStart(game));
            game.on('update', () => this.handleGameUpdate(game));
            game.on('end', () => this.handleGameEnd(game));
            Server.games.push(game);
        }
    }

    private static handleGameStart(game: BingoGame) {
        // Broadcast to users that a new game has started
    }

    private static handleGameEnd(game: BingoGame) {
        // Broadcast to users & viewers that game has ended
    }

    private static handleGameUpdate(game: BingoGame) {
        // Implement feature to live view any active game
        // Broadcast updates to players who are actively wathching live games
    }
}