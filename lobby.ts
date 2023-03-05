import { BingoGame } from './bingo';
import { Player } from './player';
import { Server } from './server';

export abstract class Lobby {
    static finders: { [id: number]: Player[] } = {};
    static maxPlrs: { [id: string]: [number, boolean] } = {
        'rmcs': [4, true],
        'bgo': [4, false],
        'ttt': [2, true],
    };

    static addFinder(plr: Player, gId, numPlr): boolean {
        const maxPlayers = this.maxPlrs[gId][0];
        const isGmAvail = (gId in this.maxPlrs); // Do server supports the game user wants to play?
        const hasValidNum = numPlr > 1 && numPlr <= maxPlayers; // Check if request contains valid player count
        const isMaxSafe = (this.maxPlrs[gId][1] && numPlr === maxPlayers); // Fixed number of players can play only
        if (!isGmAvail || !hasValidNum || !isMaxSafe) return false; // Reject malformed request

        plr.gnum = numPlr;
        plr.switchStatus();
        this.finders[numPlr].push(plr);
        this.tryMatch(numPlr); // Let's try to find a match
        return true; // Players request accepted
    }

    // Called whenever player withdraws request for matchmaking
    static removeFinder(plr: Player) {
        if (plr?.gnum in this.finders) {
            let idx = this.finders[plr?.gnum].indexOf(plr);
            if (idx > -1) this.finders[plr?.gnum].splice(idx, 1);
        }
    }

    private static tryMatch(keyPlr) {
        if (this.finders[keyPlr].length == keyPlr) { // Required amount of players connected
            const matchPlrs = this.finders[keyPlr]; // Copy all players
            this.finders[keyPlr].length = 0; // Reset the watch variable
            let game = new BingoGame(...matchPlrs); // & Create new game room with all players
            game.on("start", () => this.handleGameStart(game));
            game.on('update', () => this.handleGameUpdate(game));
            game.on('end', () => this.handleGameEnd(game));
            Server.games.push(game); // Update global games list
        }
    }

    private static handleGameStart(game: BingoGame) {
        // Broadcast to users that a new game has started
    }

    private static handleGameEnd(game: BingoGame) {
        // [To-Do]: in Game class itself call switchStatus() for each game-players
        // Broadcast to users & viewers that game has ended
    }

    private static handleGameUpdate(game: BingoGame) {
        // Implement feature to live view any active game
        // Broadcast updates to players who are actively wathching live games
    }
}