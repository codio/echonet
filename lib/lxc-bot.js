// LXC Bot
// =======


// Dependencies
// ------------
var spawn = require('child_process').spawn;
var split = require('split');
var q = require('q');
var _ = require('lodash');
var moment = require('moment');
var mongo = require('mongodb').MongoClient;


function parseLine(line) {
    var parts = line.split(/\s+/);
    return {
        container: parts[0],
        user: parts[1],
        pid: parseInt(parts[2], 10),
        cpu: parseFloat(parts[3], 10),
        mem: parseFloat(parts[4], 10),
        vsz: parseInt(parts[5], 10),
        rss: parseInt(parts[6], 10),
        tty: parts[7],
        stat: parts[8],
        start: moment(parts[9], 'HH:mm').toDate(),
        time: parts[10],
        command: _.rest(parts, 11).join(' ')
    };
}

function parse(stream) {
    var deferred = q.defer();
    var result = [];
    stream
        .pipe(split())
        .on('data', function (line) {
            if (line.indexOf('CONTAINER') === 0 || _.isEmpty(line)) {
                return;
            }
            result.push(parseLine(line));
        })
        .on('end', function () {
            deferred.resolve(result);
        });

    return deferred.promise;
}

function save(opts, processes) {
    var deferred = q.defer()
    mongo.connect(opts.uri, function (err, db) {
        if (err) return deferred.reject(err);

        var collection = db.collection(opts.collection);
        collection.insert({
            list: processes,
            date: new Date()
        }, function (err) {
            if (err) return deferred.reject(err);
            deferred.resolve();
        })
    });
    return deferred.promise();
}


function run (opts) {
    var cmd = 'lxc-ps';
    var args = ['--lxc', '--', 'auxw'];

    console.log('executing: %s %s', cmd, args.join(' '));
    var ps = spawn(cmd, args);

    // Error handling
    ps.stderr.pipe(process.stderr);

    return parse(ps.stdout).then(function (processes) {
        return save(opts.mongo, processes);
    });
}

function start(opts) {
    _.defaults(opts, {
        intervall: 2 * 60 * 1000,
        mongo: {
            uri: 'mongodb://127.0.0.1:27017/echonet',
            collection: 'lxc'
        }
    });

    run(opts);

    setTimeout(function () {
        run(opts);
        start(opts);
    }, opts.intervall);
}

// Export
// ------

module.exports = {
    start: start,
    run: run,
    _parse: parse
};
