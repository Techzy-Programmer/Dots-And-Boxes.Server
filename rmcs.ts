import { Game } from "./game";
import { Player } from "./player";

export class RMCSGame extends Game {
    gamePersona: string[] = ['r', 'm', 'c', 's'];
    psnaToPlrs: { [key: string]: Player } = {};
    readyCnt: Set<Number> = new Set();
    chitsSelected: number = 0;
    roundChits: number[] = [];
    roundPersona: string[];
    ids: number[] = [];

    constructor(...plrs: Player[]) {
        /*
         * [To-Do] Dispose game properly
         * Broadcast that game has now ended
         * Remove all listners like (Player.on())
         * Make variables null & remove reference from Master.games[]
        */

        super("Raja Mantri Chor Sipahi", ...plrs);
        this.onMessage(this.processMessage.bind(this));
    }

    processMessage(plr: Player, gmData: any) {
        const { msg, data } = gmData;

        switch (msg) {
            case "Safe-Init": this.initGameRoom(); break;

            case "Ready":
                this.readyCnt.add(plr.id);
                if (this.readyCnt.size === 4)
                    this.broadcast('Pick-Chit');
                break;

            case "Chit-Id":
                const cId = data.chitId;
                if (typeof cId === 'number' && cId > -1 && cId < 4 && !this.roundChits.includes(cId)) {
                    const myPersona = this.roundPersona[cId];
                    plr.gameProps.persona = myPersona;
                    this.psnaToPlrs[myPersona] = plr;
                    this.roundChits.push(cId);
                    this.chitsSelected++;

                    plr.gsend("Persona", { myPersona, cId });
                    const othersPersona = ['r', 's'].includes(myPersona) ? myPersona : '-';
                    this.broadcast("Others-Persona", { othersPersona, cId, uId: plr.id }, [plr]);

                    if (this.chitsSelected === 4) {
                        const vics = [this.psnaToPlrs["c"].id, this.psnaToPlrs["m"].id]
                            .sort(() => Math.random() - 0.5);

                        this.broadcast("Start-Round", {
                            sId: this.psnaToPlrs["s"].id,
                            victims: vics
                        });
                    }
                }
                break;
            default: break;
        }
    }

    initGameRoom() {
        this.all.forEach(p => {
            this.ids.push(p.id);
            p.gameProps = {};
        });

        this.roundPersona = shuffle(this.gamePersona);
    }
}

function shuffle(arrayIn: string[]): string[] {
    return ([...arrayIn].sort(
        () => Math.random() - 0.5));
}
