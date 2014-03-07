# ECHOnet

> Monitor and control station for codio operations.

Install using `npm install -g codio/echonet` to make the various commands available.


## LXC Bot

This is a small program that sits on the fileserver sending the output of `lxc-ps` to mongodb.


### Usage

```bash
$ lxc-bot -h
  Usage: lxc-bot [options]

  Options:

    -h, --help                       output usage information
    --mongo <uri>                    Mongodb uri. Default mongodb://127.0.0.1:27017/echonet
    --mongo-collection <collection>  Mongodb collection. Default lxc
    --redis-port <port>              Redis port. Default 6379
    --redis-host <uri>               Redis uri. Default 127.0.0.1
    -s --search <pid>                Search for a given pid
```
If you need `sudo` for accessing the `docker` command you'll need to call `sudo lxc-bot`.


## Development

Running tests using

```bash
$ grunt
$ grunt watch
```
