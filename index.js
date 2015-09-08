"use strict";
var net = require("net");
var parse = require("url-parse-lax");
var TIMEOUT = 3000;

module.exports = function (dest, seq, opts, cb) {
  var socket = new net.Socket(), interacting, saved = "";
  if (typeof opts === "function") cb = opts;
  opts = opts || {};

  socket.setTimeout(opts.timeout || TIMEOUT);
  socket.once("connect", socket.setNoDelay.bind(socket));

  dest = parse(dest);
  socket.connect(dest.port, dest.hostname);

  socket.on("error", function (err) {
    if (interacting) interacting = false;
    socket.removeAllListeners("data").removeAllListeners("error").end();
    cb(err);
  });
  socket.on("end", function () {
    if (interacting) {
      process.stdin.removeAllListeners("data");
      if (opts.exit) process.exit(0);
    }
  });
  socket.on("data", function next(chunk) {
    if (interacting) return process.stdout.write(chunk);

    var i;
    seq.some(function (entry, index) {
      i = entry.done ? undefined : index;
      return !entry.done;
    });

    if (!seq[i] || seq[i].done) {
      socket.removeAllListeners("data").removeAllListeners("error").end();
      return cb();
    }

    saved += chunk;
    if (saved.indexOf(seq[i].expect) !== -1) {
      seq[i].done = true;

      if (seq[i].out) {
        var lines = [];
        saved.split(/\r\n/).forEach(function (line) {
          if (line) lines.push(line);
        });
        lines = lines.length >= 3 ? lines.slice(1, lines.length - 1) : lines;
        seq[i].out(lines.join("\n"));
      }

      if (seq[i].send) {
        socket.write(seq[i].send);
      }

      if (seq[i].interact) {
        process.stdin.setRawMode(true);
        interacting = true;
        process.stdin.on("data", function (c) {
          if (!socket.writable) return;
          if (c.toString("hex") === "7f") c = Buffer("08", "hex"); // Convert DEL to BKSP
          socket.write(c);
        });
        socket.write("\r");
      }

      saved = "";
    }
  });
};
