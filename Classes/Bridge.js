"use strict";

let Node = require("./Node.js");

class Bridge extends Node {

  constructor(moniker, port, config) {
    console.log("Bridge - constructor");
    super(moniker, port, config);
    this.entries = [];
  }

  status() {
    let status = super.status();

    return status;
  }
}

module.exports = Bridge;