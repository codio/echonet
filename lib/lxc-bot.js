// LXC Bot
// =======


// Dependencies
// ------------

var spawn = require('child_process').spawn;
var path = require('path');

var split = require('split');
var q = require('q');
var fs = require('q-io/fs');
var _ = require('lodash');
var moment = require('moment');
var mongo = require('mongodb').MongoClient;
var redis = require('redis');


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
    fs.read('/proc/mounts').then(function (content) {
        // /proc/mounts has 6 fields per line, one mount per line, e.g.
        // cgroup /sys/fs/cgroup/devices cgroup rw,relatime,devices 0 0
        content.split('\n').forEach(function (line) {
            var parts = line.split(' ');
            if (parts.length === 6 && parts[2] === 'cgroup') {
                if (parts[3].split(',')[2] === type) {
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
    fs.read('/proc/self/cgroup').then(function (content) {
        content.split('\n').forEach(function (line) {
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
    return q.all([
        findCgroupMountpoint(cgroupType),
        getThisCgroup(cgroupType)
    ]).then(function (results) {
        var filename = path.join(results[0], results[1], id, 'tasks');
        return fs.exists(filename).then(function (exists) {
            if (!exists) {
                // More recent lxc versions cgroup will be in lxc/
                filename = path.join(results[0], results[1], 'lxc', id, 'tasks');
            }
            return fs.read(filename).then(function (content) {
                return content.split('\n');
            });
        });
    }).fail(function (err) {
        console.error(err);
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
            line = line.trim();
            if (!_.isEmpty(line)) {
                containers.push(line);
            }
        })
        .on('end', function () {
            deferred.resolve(containers);
        });
    return deferred.promise;
}

function run (opts) {
    return getContainers().then(function (containers) {
        return q.all(containers.map(function (container) {
            return getPidsForContainer(container).then(function (pids) {
                return {
                    container: container,
                    pids: pids
                };
            });
        }));
    });
}

function getActiveContainers(opts) {
    var deferred = q.defer();

    var redisClient = redis.createClient(opts.port, opts.host);
    redisClient.hgetall('pier:containers', function (err, list) {
        if (err) return deferred.reject(err);
        deferred.resolve(list);
    });
    return deferred.promise;
}


function start(opts) {
    _.defaults(opts, {
        mongo: {
            uri: 'mongodb://127.0.0.1:27017/echonet',
            collection: 'lxc'
        },
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    });

    return q.all([
        getActiveContainers(opts.redis),
        run(opts)
    ]).then(function (results) {
        var containers = results[0];
        var pidList = results[1];

        function getProject(id) {
            return _.findKey(containers, function (container) {
                return container === id;
            });
        }

        pidList.forEach(function (elem) {
            console.log('User/Project: %s\nContainer: %s', getProject(elem.container), elem.container);
            elem.pids.forEach(function (pid) {
                if (pid) {
                    console.log('  * PID: ' + pid);
                }
            });
        });
    });

    // setTimeout(function () {
    //     run(opts);
    //     start(opts);
    // }, opts.intervall);
}

// Export
// ------

module.exports = {
    start: start,
    run: run,
    _parse: parse
};
