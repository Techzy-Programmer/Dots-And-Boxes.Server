import { Game } from "./game";
import { Player } from "./player";

export class RMCSGame extends Game {
    // private logic = new RmcsLogic();

    constructor(...plrs: Player[]) {
        /*
         * [To-Do] Dispose game properly
         * Broadcast that game has now ended
         * Remove all listners like (Player.on())
         * Make variables null & remove reference from Master.games[]
        */

        super("Raja Mantri Chor Sipahi", ...plrs);
    }
}