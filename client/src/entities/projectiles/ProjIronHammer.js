import Projectile from "./Projectile";

class Entity extends Projectile {
    constructor(x, y, config) {
        super(x, y, config, "proj-iron-hammer");
        this.angle = this.DiagonalDirectionAngles[config.direction] || this.DiagonalDirectionAngles.l;
    }
};

export default Entity;