const Boss = require('./Boss');

class BanditLeader extends Boss { }
module.exports = BanditLeader;

BanditLeader.prototype.taskIDKilled = require('../../../../../tasks/TaskTypes').KillOutlaws.taskID;