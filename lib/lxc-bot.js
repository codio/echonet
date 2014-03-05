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

// Get the absolute path of the mount of a give cgroup.
function findCgroupMountpoint(type) {
    var deferred = q.defer();
    fs.readFile('/proc/mounts').then(function (buffer) {
        // /proc/mounts has 6 fields per line, one mount per line, e.g.
        // cgroup /sys/fs/cgroup/devices cgroup rw,relatime,devices 0 0
        buffer.toString().split('\n').forEach(function (line) {
            var parts = line.split(' ');
            if (parts.length === 6 && parts[2] === 'cgroup') {
                if (_.last(parts[3].split(',')) === type) {
                    deferred.resolve(parts[1]);
                }
            }
        });
    }).fail(deferred.reject);
    return deferred.promise;
}

// Get the absolute path to the cgroup docker is running in.
function getThisCgroup(type) {
    var deferred = q.defer();
    fs.readFile('/proc/self/cgroup').then(function (buffer) {
        buffer.toString().split('\n').forEach(function (line) {
            var parts = line.split(':');
            if (parts[1] === type) {
                deferred.resolve(parts[2]);
            }
        });
    }).fail(deferred.reject);
    return deferred.promise;
}

// Get a list of all pids running in a given container.
function getPidsForContainer(id) {
    var cgroupType = 'memory';
    var cgroupRoot = findCgroupMountpoint(cgroupType);
    var cgroupThis = getThisCgroup(cgroupType);

    var filename = path.join(cgroupRoot, cgroupThis, id, 'tasks');
    return fs.exists(filename).then(function (exists) {
        if (!exists) {
            // More recent lxc versions cgroup will be in lxc/
            filename = path.join(cgroupRoot, cgroupThis, 'lxc', id, 'tasks');
        }
        return fs.readFile(filename).then(function (buffer) {
            return buffer.toString().split('\n');
        });
    });
}

// Get a list of all running containers.
function getContainers() {
    var deferred = q.defer();
    var containers = [];
    // Have to shell out to docker :(
    var cmd = 'docker';
    var args = ['ps', '-notrunc', '-q'];
    var docker = spawn(cmd, args);
    docker.stderr.on('data', function (err) {
        deferred.reject(err.toString());
    });
    docker.stdout
        .pipe(split())
        .on('data', function (line) {
            if (!_.isEmpty(line)) {
                result.push(line.trim());
            }
        })
        .on('end', function () {
            deferred.resolve(containers);
        });
    return deferred.promise;
}

function run (opts) {
    getContainers().then(function (containers) {
        console.log('Got containers');
        console.log(containers);
        q.all(containers.map(function (container) {
            return getPidsForContainer(container).then(function (pids) {
                var res = {};
                res[container] = pids;
                return res;
            });
        })).then(function (list) {
            console.log(list);
        });
    }).fail(function (err) {
        console.error(err);
    });

}

function start(opts) {
    _.defaults(opts, {
        intervall: 10 * 1000,
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
