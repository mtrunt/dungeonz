const ResourceNode = require("./ResourceNode");
const Item = require("../../../../items/ItemsList").BY_NAME.Greencap;

class GreenMushroom extends ResourceNode {}

GreenMushroom.prototype.ItemType = Item;
GreenMushroom.prototype.interactionEnergyCost = 2;
GreenMushroom.prototype.reactivationRate = 20000;
GreenMushroom.prototype.gloryGiven = 10;
GreenMushroom.prototype.gatherTaskId = require("../../../../tasks/TaskTypes").GatherGreencaps.taskId;

module.exports = GreenMushroom;
