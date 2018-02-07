"use strict";

const Base = require("../Base.js");

/* Types */
/* =============
0x1001 = Simple
0x1002 = Distance
0x1003 = Id
0x1004 = Signature
0x1005 = Address
================ */

class Simple extends Base {

  constructor() {
    super();
    this.type = 0x1001;
    this.map = "simple";
  }
}

module.exports = Simple;
