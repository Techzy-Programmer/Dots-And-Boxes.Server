import { BingoGame } from './bingo';
import { Player } from './player';
import { Master } from './master';
import { Game } from './game';

export abstract class Lobby {
    static plrsMap: { [id: number]: [string, number] } = {};
    static finders: { [id: string]: { [id: number]: Player[] } } = {
        'rmcs': [],
        'bgo': [],
        'ttt': []
    };

    static maxPlrs: { [id: string]: [number, boolean] } = {
        'uno': [15, false],
        'rmcs': [4, true],
        'bgo': [4, false],
        'ttt': [2, true],
    };

    static addFinder(plr: Player, gId: string, numPlr: number): boolean {
        const maxPlayers = this.maxPlrs[gId][0];
        const isGmAvail = (gId in this.maxPlrs); // Do server supports the game user wants to play?
        const hasValidNum = numPlr > 1 && numPlr <= maxPlayers; // Check if request contains valid player count
        const isMaxSafe = (this.maxPlrs[gId][1] && numPlr === maxPlayers); // Fixed number of players can play only
        if (!isGmAvail || !hasValidNum || !isMaxSafe) return false; // Reject malformed request

        plr.switchStatus();
        this.plrsMap[plr.id] = [gId, numPlr];

        if (!(numPlr in this.finders[gId]))
            this.finders[gId][numPlr] = [];
        this.finders[gId][numPlr].push(plr);
        this.tryMatch(gId, this.finders[gId], numPlr); // Let's try to find a match
        return true; // Players request accepted
    }

    // Called whenever player withdraws request for matchmaking
    static removeFinder(plr: Player) {
        plr.switchStatus(); // Makes player idle
        const plrSearchData = this.plrsMap[plr.id];
        let numSearch = plrSearchData[1];
        let gmSearch = plrSearchData[0];

        if (gmSearch in this.finders) {
            let idx = this.finders[gmSearch][numSearch].indexOf(plr);
            if (idx > -1) {
                delete this.plrsMap[plr.id];
                this.finders[gmSearch][numSearch].splice(idx, 1);
            }
        }
    }

    private static tryMatch(gId, roomRef: { [id: number]: Player[] }, keyPlr) {
        if (roomRef[keyPlr].length == keyPlr) { // Required amount of players connected
            const matchPlrs = roomRef[keyPlr]; // Copy all players
            roomRef[keyPlr].length = 0; // Reset the watch variable
            let game: Game;

            switch (gId) {
                case "rmcs": {
                    game = new BingoGame(...matchPlrs); // & Create new game room with all players
                    break;
                }
            }

            game.on("start", () => this.handleGameStart(game));
            game.on('update', () => this.handleGameUpdate(game));
            game.on('end', () => this.handleGameEnd(game));
            Master.games.push(game); // Update global games list
        }
    }

    private static handleGameStart(game: Game) {
        // Broadcast to users that a new game has started
    }

    private static handleGameEnd(game: Game) {
        // [To-Do]: in Game class itself call switchStatus() for each game-players
        // Broadcast to users & viewers that game has ended
    }

    private static handleGameUpdate(game: Game) {
        // Implement feature to live view any active game
        // Broadcast updates to players who are actively wathching live games
    }
}