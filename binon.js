"use strict";

const JSON5 = require("json5"),
  format = require("string-format"),
  bigInt = require("big-integer"),
  FS = require("fs");

class BinOn {

  constructor(classMap, defaultObjectName) {
    if (typeof classMap != "object") {
      throw new Error("BinOn requires a class map for construction");
    }
    this.maps = {};
    this.mapsByType = {};
    this.classMap = classMap;
    this.defaultObjectName = defaultObjectName;
  }

  writeInt256BE(buffer, value) {
    for (let j = 0; j < 32; j++) {
      buffer.writeInt8(0x0f, j);
    }
  }

  writeUInt256BE(buffer, value) {
    for (let j = 0; j < 32; j++) {
      buffer.writeUInt8(0xff, j);
    }
  }

  readInt256BE(buffer, offset) {
    return new bigInt(0);
  }

  readUInt256BE(buffer, offset) {
    return new bigInt(0);
  }

  bufferConcat(list, length) {

    let buffer, pos, len = length;

    if (!Array.isArray(list)) {
      throw new Error("Usage: bufferConcat(list, [length])");
    }

    if (list.length === 0) {
      return new Buffer(0);
    } else if (list.length === 1) {
      return list[0];
    }

    if (typeof len !== "number") {
      len = 0;
      for (let i = 0; i < list.length; i++) {
        let buf = list[i];

        len += buf.length;
      }
    }

    buffer = Buffer.alloc(len);
    pos = 0;
    for (let i = 0; i < list.length; i++) {
      let buf = list[i];

      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer;
  }

  bufferToJson(buffer, offset) {
    let obj = this.bufferToObj(buffer, offset);

    return JSON.stringify(obj);
  }

  bufferToJson5(buffer, offset) {
    let obj = this.bufferToObj(buffer, offset);

    return JSON5.stringify(obj);
  }

  getTypeFromBuffer(buffer) {
    return buffer.readUInt16BE(0);
  }

  getMapFromBuffer(buffer) {
    return this.mapsByType[this.getTypeFromBuffer(buffer)].name;
  }

  bufferToObj(buffer, offset, target, map) {
    let parts, length, activeMap = this.maps[map || this.getMapFromBuffer(buffer)], obj = target || new this.classMap[activeMap.name](),
      currentOffset = offset || 0;

    if (activeMap.extends) {
      currentOffset += this.bufferToObj(buffer, offset, obj, activeMap.extends).offset;
    }

    for (let i = 0; i < activeMap.fields.length; i++) {
      switch (activeMap.fields[i].type) {
        case "uint8":
          obj[activeMap.fields[i].name] = buffer.readUInt8(currentOffset);
          currentOffset += 1;
          break;
        case "uint16":
          obj[activeMap.fields[i].name] = buffer.readUInt16BE(currentOffset);
          currentOffset += 2;
          break;
        case "uint32":
          obj[activeMap.fields[i].name] = buffer.readUInt32BE(currentOffset);
          currentOffset += 4;
          break;
        case "uint256":
          obj[activeMap.fields[i].name] = this.readUInt256BE(buffer, currentOffset);
          currentOffset += 32;
          break;
        case "int8":
          obj[activeMap.fields[i].name] = buffer.readInt8(currentOffset);
          currentOffset += 1;
          break;
        case "int16":
          obj[activeMap.fields[i].name] = buffer.readInt16BE(currentOffset);
          currentOffset += 2;
          break;
        case "int32":
          obj[activeMap.fields[i].name] = buffer.readInt32BE(currentOffset);
          currentOffset += 4;
          break;
        case "int256":
          obj[activeMap.fields[i].name] = this.readInt256BE(buffer, currentOffset);
          currentOffset += 32;
          break;
        default: // these are custom types
          parts = activeMap.fields[i].type.split("*");
          if (parts.length > 1) {
            length = buffer.readUInt16BE(currentOffset);
            console.log(format("array: [{}, {}]", activeMap.fields[i].name, currentOffset));
            currentOffset += 2;
            obj[activeMap.fields[i].name] = [];
            for (let j = 0; j < length; j++) {
              let subResult = this.bufferToObj(buffer, currentOffset);

              obj[activeMap.fields[i].name].push(subResult.obj);
              currentOffset = subResult.offset;
            }
          } else {
            console.log(format("single: [{}, {}]", activeMap.fields[i].name, currentOffset));
            let subResult = this.bufferToObj(buffer, currentOffset);

            obj[activeMap.fields[i].name] = subResult.obj;
            currentOffset = subResult.offset;
          }
          break;
      }
    }

    return { offset: currentOffset, obj: obj };
  }

  jsonToBuffer(json) {
    let obj = JSON.parse(json);

    return this.objToBuffer(obj);
  }

  json5ToBuffer(json5) {
    let obj = JSON.parse(json5);

    return this.objToBuffer(obj);
  }

  objToBuffer(obj, map) {
    let bi, parts, buf, buffers = [],
      activeMap = this.maps[obj.map];

    if (map) {
      parts = map.split("*");
      activeMap = this.maps[parts[0]];
    }

    if (!activeMap) {
      throw new Error(format("Usage: Map Not Found [{}]", map));
    }

    console.log("ActiveMap: " + activeMap.name);

    if (activeMap.extends) {
      buffers.push(this.objToBuffer(obj, activeMap.extends));
    }

    for (let i = 0; i < activeMap.fields.length; i++) {
      console.log("Field: " + activeMap.fields[i].name);
      switch (activeMap.fields[i].type) {
        case "uint8":
          buf = Buffer.alloc(1);
          buf.writeUInt8(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "uint16":
          buf = Buffer.alloc(2);
          buf.writeUInt16BE(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "uint32":
          buf = Buffer.alloc(4);
          buf.writeUInt32BE(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "uint256":
          bi = bigInt(obj[activeMap.fields[i].name]);
          if (bi.lesser("0")) {
            bi = 0;
          } else if (bi.greater(bigInt("FF", 32))) {
            bi = bigInt("FF", 32);
          }
          buf = Buffer.alloc(32);
          this.writeUInt256BE(buf, bi);
          buffers.push(buf);
          break;
        case "int8":
          buf = Buffer.alloc(1);
          buf.writeInt8(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "int16":
          buf = Buffer.alloc(2);
          buf.writeInt16(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "int32":
          buf = Buffer.alloc(4);
          buf.writeInt32(parseInt(obj[activeMap.fields[i].name]));
          buffers.push(buf);
          break;
        case "int256":
          bi = bigInt(obj[activeMap.fields[i].name]);
          if (bi.lesser("0")) {
            bi = 0;
          } else if (bi.greater(bigInt("FF", 32))) {
            bi = bigInt("FF", 32);
          }
          buf = Buffer.alloc(32);
          this.writeInt256BE(buf, bi);
          buffers.push(buf);
          break;
        default: // these are custom types
          parts = activeMap.fields[i].type.split("*");
          if (parts.length > 1) {
            console.log("array: " + activeMap.fields[i].name);
            buf = Buffer.alloc(2);
            buf.writeUInt16BE(obj[activeMap.fields[i].name].length);
            buffers.push(buf);
            for (let j = 0; j < obj[activeMap.fields[i].name].length; j++) {
              buffers.push(this.objToBuffer(obj[activeMap.fields[i].name][j], parts[0]));
            }
          } else {
            console.log("single: " + activeMap.fields[i].name);
            buffers.push(this.objToBuffer(obj[activeMap.fields[i].name], activeMap.fields[i].type));
          }

          break;
      }
    }
    console.log(typeof buffers);
    return this.bufferConcat(buffers);
  }

  loadMaps(folder, complete) {
    let folderToLoad = folder || "./BinOn";

    FS.readdir(folderToLoad, (error, filenames) => {
      if (error) {
        console.error(format("readdir: {}", error));
        complete();
      } else {
        console.log(format("loadObjects.folder: {}", filenames.length));
        let fileCount = filenames.length;

        filenames.forEach((filename) => {
          let fullPath = format("{}/{}", folderToLoad, filename);

          FS.lstat(fullPath, (statsError, stats) => {
            if (statsError) {
              console.error(format("lstat: {}", statsError));
              fileCount--;
              if (fileCount === 0) {
                complete();
              }
            } else if (stats.isDirectory()) {
              this.loadMaps(fullPath, () => {
                fileCount--;
                if (fileCount === 0) {
                  complete();
                }
              });
            } else {
              FS.readFile(fullPath, "utf-8", (fileError, content) => {
                if (fileError) {
                  console.error(format("readFile: {}", fileError));
                } else {
                  let obj = JSON5.parse(content);

                  this.maps[obj.name] = obj;
                  this.mapsByType[obj.type] = obj;
                  console.log(format("loadObjects.loaded: {}", obj.name));
                }
                fileCount--;
                if (fileCount === 0) {
                  complete();
                }
              });
            }
          });
        });
      }
    });
  }
}

module.exports = BinOn;
