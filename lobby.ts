import { BingoGame } from './bingo';
import { Player } from './player';
import { Master } from './master';
import { Game } from './game';
import { RMCSGame } from './rmcs';

export abstract class Lobby {
    static plrsMap: { [id: number]: [string, number] } = {};
    static finders: { [id: string]: { [id: number]: Player[] } } = {
        'rmcs': {},
        'bgo': {},
        'ttt': {},
        'uno': {}
    };

    static maxPlrs: { [id: string]: [number, boolean] } = {
        'uno': [16, false],
        'rmcs': [4, true],
        'bgo': [4, false],
        'ttt': [2, true],
    };

    static addFinder(plr: Player, gId: string, numPlr: number): boolean {
        const maxPlayers = this.maxPlrs[gId][0];
        const isGmAvail = (gId in this.maxPlrs); // Do server supports the game user wants to play?
        const hasValidNum = numPlr > 1 && numPlr <= maxPlayers; // Check if request contains valid player count
        const isMaxSafe = (this.maxPlrs[gId][1] ? numPlr === maxPlayers : numPlr <= maxPlayers); // Fixed number of players can play only
        if (!isGmAvail || !hasValidNum || !isMaxSafe) return false; // Reject malformed request

        plr.switchStatus();
        this.plrsMap[plr.id] = [gId, numPlr];

        if (!(numPlr in this.finders[gId]))
            this.finders[gId][numPlr] = [];
        this.finders[gId][numPlr].push(plr);
        this.tryMatch(gId, this.finders[gId], numPlr, plr); // Let's try to find a match
        return true; // Players request accepted
    }

    // Called whenever player withdraws request for matchmaking
    static removeFinder(plr: Player) {
        plr.switchStatus(); // Makes player idle
        if (!(plr.id in this.plrsMap)) return;
        const plrSearchData = this.plrsMap[plr.id];
        let numSearch = plrSearchData[1];
        let gmSearch = plrSearchData[0];

        if (gmSearch in this.finders) {
            const plrs = this.finders[gmSearch][numSearch];
            let idx = plrs.indexOf(plr);

            if (idx > -1) {
                delete this.plrsMap[plr.id];
                plrs.splice(idx, 1);
            }

            plrs.forEach(p => p.send('Match-Making-Left', { id: plr.id }));
        }
    }

    private static tryMatch(gId, roomRef: { [id: number]: Player[] }, keyPlr, joined: Player) {
        const roomPlrs = roomRef[keyPlr];
        const plrsId: number[] = [];

        for (var i = 0; i < roomPlrs.length; i++) {
            const eachPlr = roomPlrs[i];
            if (joined === eachPlr) continue;

            plrsId.push(eachPlr.id);
            eachPlr.send("New-Opponent", {
                id: joined.id
            });
        }

        joined.send("In-Lobby", {
            ids: plrsId
        });

        if (roomPlrs.length == keyPlr) { // Required amount of players connected
            let game: Game;

            switch (gId) {
                case "rmcs": {
                    game = new RMCSGame(...roomPlrs); // & Create new game room with all players
                    break;
                }

                case "bgo": {
                    game = new BingoGame(...roomPlrs);
                    break;
                }
            }

            game.on("start", () => this.handleGameStart(game));
            game.on('update', () => this.handleGameUpdate(game));
            game.on('end', () => this.handleGameEnd(game));
            Master.games.add(game); // Update global games list
            roomPlrs.length = 0; // Reset the watch variable
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